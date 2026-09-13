"""Data.gov.in mandi price service (AGMARKNET).

Resource: "Current Daily Price of Various Commodities from Various Markets"
          9ef84268-d588-465a-a308-a864a43d0070

FIELD NAMES ARE VERIFIED, NOT GUESSED
-------------------------------------
Confirmed against a live response on 2026-08-29 (14,396 records):

    state         keyword
    district      keyword
    market        keyword
    commodity     keyword
    variety       keyword
    grade         keyword
    arrival_date  string, DD/MM/YYYY  <- NOT ISO
    min_price     rupees per quintal
    max_price     rupees per quintal
    modal_price   rupees per quintal

Three quirks that will bite you if unhandled:

1. `arrival_date` is DD/MM/YYYY, so naive ISO parsing fails.
2. The state filter is exposed as `state.keyword`, while district, market and
   commodity are plain names. Using `state` alone silently returns nothing.
3. State spellings are AGMARKNET's, not the common ones — the live response
   returns "Keralam", not "Kerala". STATE_ALIASES below maps these.

SECURITY
--------
DATA_GOV_API_KEY is read from the environment and used only here, server side.
It is never returned in a response body and never reaches the browser.
"""

import asyncio
import logging
import random
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

log = logging.getLogger("agri.market.datagov")

BASE_URL = "https://api.data.gov.in/resource"

# data.gov.in's own publicly documented shared trial key (published on the
# API docs page for every dataset, not a secret and not scraped/guessed —
# see https://www.data.gov.in, "API" tab on any resource). It exists
# specifically so a new integration works before anyone registers their
# own key, and is capped by data.gov.in itself to a maximum of 10 records
# per request. Used ONLY when DATA_GOV_API_KEY is blank, so real farmer
# deployments are never silently stuck on a 10-record trial feed without
# knowing it — see the `sample_key` flag threaded through every result
# below, which the frontend surfaces as a visible banner.
PUBLIC_SAMPLE_API_KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b"
SAMPLE_KEY_NOTICE = (
    "Using data.gov.in's public trial key (max 10 records per request), "
    "because no personal DATA_GOV_API_KEY is set in backend/.env. Results "
    "may be incomplete. Register free at https://data.gov.in for your own "
    "key and full coverage.")

STATUS_OK = "ok"
STATUS_EMPTY = "empty"
STATUS_UNAVAILABLE = "unavailable"
STATUS_NOT_CONFIGURED = "not_configured"
STATUS_TIMEOUT = "timeout"

# AGMARKNET spellings differ from common usage. Verified live: "Keralam".
STATE_ALIASES = {
    "kerala": "Keralam",
    "keralam": "Keralam",
    "orissa": "Odisha",
    "pondicherry": "Pondicherry",
    "uttaranchal": "Uttarakhand",
    "chattisgarh": "Chhattisgarh",
    "madhya pradesh": "Madhya Pradesh",
    "mp": "Madhya Pradesh",
}

# Our internal crop keys -> AGMARKNET commodity names. The API will not match
# "soybean"; the commodity is listed as "Soyabean".
COMMODITY_ALIASES = {
    # --- cereals ---
    "wheat": "Wheat",
    "rice": "Rice",
    "paddy": "Paddy(Dhan)(Common)",
    "maize": "Maize",
    "corn": "Maize",
    "jowar": "Jowar(Sorghum)",
    "sorghum": "Jowar(Sorghum)",
    "bajra": "Bajra(Pearl Millet/Cumbu)",
    "barley": "Barley (Jau)",
    "ragi": "Ragi (Finger Millet)",
    # --- pulses ---
    "chickpea": "Bengal Gram(Gram)(Whole)",
    "gram": "Bengal Gram(Gram)(Whole)",
    "chana": "Bengal Gram(Gram)(Whole)",
    "tur": "Arhar (Tur/Red Gram)(Whole)",
    "arhar": "Arhar (Tur/Red Gram)(Whole)",
    "pigeonpea": "Arhar (Tur/Red Gram)(Whole)",
    "moong": "Green Gram (Moong)(Whole)",
    "greengram": "Green Gram (Moong)(Whole)",
    "urad": "Black Gram (Urd Beans)(Whole)",
    "blackgram": "Black Gram (Urd Beans)(Whole)",
    "masoor": "Masur Dal",
    "lentil": "Masur Dal",
    "peas": "Peas(Dry)",
    # --- oilseeds ---
    "soybean": "Soyabean",
    "soyabean": "Soyabean",
    "soya": "Soyabean",
    "wheat": "Wheat",
    "chickpea": "Bengal Gram(Gram)(Whole)",
    "gram": "Bengal Gram(Gram)(Whole)",
    "chana": "Bengal Gram(Gram)(Whole)",
    "maize": "Maize",
    "corn": "Maize",
    "cotton": "Cotton",
    "rice": "Paddy(Dhan)(Common)",
    "paddy": "Paddy(Dhan)(Common)",
    "tomato": "Tomato",
    "potato": "Potato",
    "onion": "Onion",
    "brinjal": "Brinjal",
    "chilli": "Green Chilli",
    "banana": "Banana",
    "okra": "Bhindi(Ladies Finger)",
    "bhindi": "Bhindi(Ladies Finger)",
    "mustard": "Mustard",
    "sarson": "Mustard",
    "groundnut": "Groundnut",
    "peanut": "Groundnut",
    "sesame": "Sesamum(Sesame,Gingelly,Til)",
    "til": "Sesamum(Sesame,Gingelly,Til)",
    "sunflower": "Sunflower",
    "linseed": "Linseed",
    "castor": "Castor Seed",
    # --- vegetables ---
    "cauliflower": "Cauliflower",
    "cabbage": "Cabbage",
    "carrot": "Carrot",
    "peas_green": "Green Peas",
    "bottlegourd": "Bottle gourd",
    "bittergourd": "Bitter gourd",
    "pumpkin": "Pumpkin",
    "cucumber": "Cucumbar(Kheera)",
    "garlic": "Garlic",
    "ginger": "Ginger(Green)",
    "coriander": "Coriander(Leaves)",
    "spinach": "Spinach",
    "drumstick": "Drumstick",
    "beans": "Beans",
    "cowpea": "Cowpea(Veg)",
    "radish": "Raddish",
    "beetroot": "Beetroot",
    "capsicum": "Capsicum",
    # --- fruits ---
    "mango": "Mango",
    "papaya": "Papaya",
    "guava": "Guava",
    "orange": "Orange",
    "pomegranate": "Pomogranate",
    "grapes": "Grapes",
    "watermelon": "Water Melon",
    "lemon": "Lemon",
    # --- commercial ---
    "sugarcane": "Sugarcane",
    "turmeric": "Turmeric",
    "coriander_seed": "Coriander(Seed)",
    "cumin": "Cummin Seed(Jeera)",
    "jute": "Jute",
    "arecanut": "Arecanut(Betelnut/Supari)",
    "coconut": "Coconut",
}

_cache: Dict[str, Dict[str, Any]] = {}
# Mandi arrivals are reported at most once a day, so a long TTL is correct —
# it just needs to be refreshed once each morning (see prewarm_common() and
# the startup scheduler in main.py) rather than re-fetched on every request.
# Set comfortably under 24h so that even if the morning job is ever missed
# (server restart mid-refresh, data.gov.in down at 6am, etc.) the cache
# self-heals: the next farmer request that misses this TTL simply fetches
# fresh data itself instead of serving yesterday's price indefinitely.
CACHE_TTL_SECONDS = 20 * 60 * 60  # 20 hours
# 2, not 3: with a realistic read timeout (see below), 3 attempts would no
# longer fit the 20-30s farmer-facing budget. One retry still absorbs a
# single transient blip; data.gov.in being CONSISTENTLY unreachable isn't
# something a 3rd attempt fixes anyway.
MAX_ATTEMPTS = 2
RETRY_STATUS = {429, 500, 502, 503, 504}
# Hard wall-clock budget for one fetch_prices() call, retries included. A
# farmer asking "is this offer worth it?" needs an answer in well under 30s
# (see ROIIn/roi() in api/crops_market.py, which calls this) — a slow
# upstream must fail fast and honestly rather than leave them staring at a
# spinner past that window.
OVERALL_TIMEOUT_SECONDS = 28.0

# The crops most commonly grown by farmers using this platform (mirrors
# ASSUMED_YIELD_BOOST_T_PER_ACRE's crop list in fertilizer.py, extended with
# the other high-traffic commodities from crop_suitability.MP_CROPS), used
# to pre-warm the cache every morning — see prewarm_common().
COMMON_COMMODITIES = [
    "soybean", "wheat", "chickpea", "maize", "cotton", "rice", "tomato",
    "onion", "potato", "mustard", "groundnut", "sugarcane",
]


def canonical_state(state: str) -> str:
    if not state:
        return ""
    return STATE_ALIASES.get(state.strip().lower(), state.strip().title())


def canonical_commodity(crop: str) -> str:
    if not crop:
        return ""
    return COMMODITY_ALIASES.get(crop.strip().lower(), crop.strip().title())


def _cache_key(params: Dict[str, Any]) -> str:
    return "|".join(f"{k}={v}" for k, v in sorted(params.items()) if k != "api-key")


def _from_cache(key: str) -> Optional[Dict[str, Any]]:
    hit = _cache.get(key)
    if not hit:
        return None
    if time.time() - hit["cached_at"] > CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    out = dict(hit["payload"])
    out["cached"] = True
    out["cache_age_s"] = round(time.time() - hit["cached_at"])
    return out


def parse_arrival_date(raw: str) -> Optional[str]:
    """DD/MM/YYYY -> ISO. Returns None rather than guessing on odd input."""
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _to_float(value: Any) -> Optional[float]:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def normalise_record(rec: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Map one API record onto our schema. Drops records with no usable price."""
    modal = _to_float(rec.get("modal_price"))
    if modal is None:
        return None

    iso = parse_arrival_date(rec.get("arrival_date", ""))
    return {
        "state": rec.get("state", ""),
        "district": rec.get("district", ""),
        "market": rec.get("market", ""),
        "commodity": rec.get("commodity", ""),
        "variety": rec.get("variety", ""),
        "grade": rec.get("grade", ""),
        "arrival_date": iso,
        "arrival_date_raw": rec.get("arrival_date", ""),
        "min_price": _to_float(rec.get("min_price")),
        "max_price": _to_float(rec.get("max_price")),
        "modal_price": modal,
        "unit": "INR/quintal",
    }


def _unavailable(status: str, message: str, **extra) -> Dict[str, Any]:
    out = {
        "status": status,
        "records": [],
        "count": 0,
        "source": "data.gov.in AGMARKNET",
        "message": message,
    }
    out.update(extra)
    return out


async def fetch_prices(
    *,
    state: str = "",
    district: str = "",
    market: str = "",
    commodity: str = "",
    arrival_date: str = "",
    limit: int = 50,
    offset: int = 0,
    use_cache: bool = True,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Query the mandi price API. Never raises; returns a status field.

    `force_refresh=True` skips reading the cache (used by the morning
    pre-warm job and the admin "refresh now" endpoint) but still WRITES the
    fresh result to it, so the very next farmer request — cached or not —
    gets today's price either way.

    The whole call (including retries) is bounded to
    OVERALL_TIMEOUT_SECONDS: if data.gov.in is too slow to answer within
    that budget, this returns status="timeout" rather than leaving the
    caller (a farmer waiting on "is this offer worth it?") hanging.
    """
    try:
        return await asyncio.wait_for(
            _fetch_prices_inner(
                state=state, district=district, market=market,
                commodity=commodity, arrival_date=arrival_date,
                limit=limit, offset=offset, use_cache=use_cache,
                force_refresh=force_refresh),
            timeout=OVERALL_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        log.warning("mandi fetch exceeded %.0fs overall budget", OVERALL_TIMEOUT_SECONDS)
        return _unavailable(
            STATUS_TIMEOUT,
            f"data.gov.in did not respond within {OVERALL_TIMEOUT_SECONDS:.0f} "
            f"seconds (tried {MAX_ATTEMPTS} times). data.gov.in is often "
            f"slow, so a one-off timeout is normal — try again in a moment. "
            f"If this happens on every single request, the server this app "
            f"runs on likely can't reach api.data.gov.in at all (a firewall "
            f"or hosting provider blocking outbound HTTPS is the usual "
            f"cause) — verify with "
            f"`curl -I https://api.data.gov.in` from that server; a hang or "
            f"connection error there confirms it's a network issue, not "
            f"this app.")


async def _fetch_prices_inner(
    *,
    state: str = "",
    district: str = "",
    market: str = "",
    commodity: str = "",
    arrival_date: str = "",
    limit: int = 50,
    offset: int = 0,
    use_cache: bool = True,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """Do the actual work for fetch_prices(); see that function for the
    timeout/force_refresh contract."""

    used_sample_key = not settings.DATA_GOV_API_KEY
    api_key = settings.DATA_GOV_API_KEY or PUBLIC_SAMPLE_API_KEY

    resource = settings.DATA_GOV_RESOURCE_ID
    if not resource:
        return _unavailable(
            STATUS_NOT_CONFIGURED,
            "DATA_GOV_RESOURCE_ID is not set in backend/.env.")

    params: Dict[str, Any] = {
        "api-key": api_key,
        "format": "json",          # default is XML
        # The public sample key is capped at 10 records by data.gov.in
        # itself regardless of what we ask for; requesting more with a
        # real key is unaffected by this clamp.
        "limit": max(1, min(int(limit), 10 if used_sample_key else 1000)),
        "offset": max(0, int(offset)),
    }

    # The state filter is exposed as `state.keyword`; the rest are plain.
    if state:
        params["filters[state.keyword]"] = canonical_state(state)
    if district:
        params["filters[district]"] = district.strip().title()
    if market:
        params["filters[market]"] = market.strip()
    if commodity:
        params["filters[commodity]"] = canonical_commodity(commodity)
    if arrival_date:
        params["filters[arrival_date]"] = arrival_date.strip()

    key = _cache_key(params)
    if use_cache and not force_refresh:
        cached = _from_cache(key)
        if cached:
            log.debug("mandi cache hit: %s", key)
            return cached

    url = f"{BASE_URL}/{resource}"
    # data.gov.in is genuinely slow — several seconds is normal even for a
    # filtered query, not a sign of a broken connection. An earlier version
    # of this used a 5s read timeout "to be safe", which in practice meant
    # almost every real request was killed before data.gov.in ever got a
    # chance to answer, regardless of network health. 10s per attempt, 2
    # attempts, stays inside OVERALL_TIMEOUT_SECONDS (worst case here:
    # 2 * (3s connect + 10s read) + ~1s backoff ≈ 27s) while giving the
    # actual upstream a realistic chance to respond.
    timeout = httpx.Timeout(connect=3.0, read=10.0, write=5.0, pool=3.0)
    last_error = ""

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(url, params=params)
        except httpx.TimeoutException:
            last_error = "data.gov.in did not respond within the timeout"
        except httpx.HTTPError as exc:
            last_error = f"could not reach data.gov.in ({type(exc).__name__})"
        else:
            if resp.status_code == 200:
                try:
                    payload = resp.json()
                except ValueError:
                    last_error = "data.gov.in returned a non-JSON response"
                    break
                return _build_result(
                    payload, key, use_cache,
                    commodity=canonical_commodity(commodity) if commodity else "",
                    state=canonical_state(state) if state else "",
                    district=district.strip().title() if district else "",
                    used_sample_key=used_sample_key)

            if resp.status_code in (401, 403):
                return _unavailable(
                    STATUS_UNAVAILABLE,
                    f"data.gov.in rejected the API key (HTTP {resp.status_code}). "
                    f"Check DATA_GOV_API_KEY in backend/.env.",
                    sample_key=used_sample_key)

            last_error = f"data.gov.in returned HTTP {resp.status_code}"
            if resp.status_code not in RETRY_STATUS:
                break

        if attempt < MAX_ATTEMPTS:
            delay = (2 ** (attempt - 1)) * 0.5
            delay += random.uniform(0, delay)
            log.warning("mandi attempt %d/%d failed (%s); retry in %.1fs",
                        attempt, MAX_ATTEMPTS, last_error, delay)
            await asyncio.sleep(delay)

    log.error("mandi fetch failed: %s", last_error)
    return _unavailable(
        STATUS_UNAVAILABLE,
        f"Live mandi price is currently unavailable ({last_error}). "
        f"Please check your local mandi or the AGMARKNET portal.",
        sample_key=used_sample_key)


def _matches(rec: Dict[str, Any], commodity: str, state: str,
             district: str) -> bool:
    """Client-side verification of the server-side filter.

    data.gov.in silently ignores a filter it cannot apply and returns the
    UNFILTERED feed instead of an error. That is why every crop was showing
    the same price: the response was simply the first N rows of everything.

    Re-checking here guarantees a caller asking for Soyabean never receives
    Carrot rows, whatever the API decided to do with the filter.
    """
    if commodity:
        want = commodity.strip().lower()
        got = str(rec.get("commodity", "")).strip().lower()
        # Substring both ways: "Paddy(Dhan)(Common)" vs "Paddy(Common)".
        if want not in got and got not in want:
            return False
    if state:
        if str(rec.get("state", "")).strip().lower() != state.strip().lower():
            return False
    if district:
        if str(rec.get("district", "")).strip().lower() != district.strip().lower():
            return False
    return True


def _build_result(payload: Dict[str, Any], cache_key: str,
                  use_cache: bool, *, commodity: str = "", state: str = "",
                  district: str = "", used_sample_key: bool = False) -> Dict[str, Any]:
    """Validate and normalise an API payload."""
    if not isinstance(payload, dict):
        return _unavailable(STATUS_UNAVAILABLE,
                            "data.gov.in returned an unexpected response shape.",
                            sample_key=used_sample_key)

    raw_records = payload.get("records")
    if not isinstance(raw_records, list):
        # data.gov.in returns HTTP 200 even for some error conditions (an
        # invalid api-key or resource id often comes back this way, not as
        # a 401/403) — the body just won't have a real 'records' array.
        # Surfacing a snippet of what it actually said turns "unavailable"
        # from a dead end into something a farmer or developer can act on.
        hint = payload.get("message") or payload.get("error") or payload.get("status")
        snippet = f" data.gov.in said: {str(hint)[:200]!r}." if hint else (
            f" Response had keys: {list(payload.keys())[:10]}." if payload else "")
        return _unavailable(
            STATUS_UNAVAILABLE,
            "data.gov.in response contained no 'records' array." + snippet,
            sample_key=used_sample_key)

    verified = [x for x in raw_records
                if isinstance(x, dict) and _matches(x, commodity, state, district)]

    dropped = len(raw_records) - len(verified)
    if dropped:
        log.info("mandi: dropped %d row(s) the server filter did not apply",
                 dropped)

    records = [r for r in (normalise_record(x) for x in verified)
               if r is not None]

    if not records:
        return _unavailable(
            STATUS_EMPTY,
            "No mandi price records match this crop and location today. "
            "Prices are only published for markets that reported arrivals."
            + (" (Note: only searching within the first 10 sample-key "
               "records, which may simply not include this crop/state — "
               "add your own free API key for the full dataset.)"
               if used_sample_key else ""),
            total_available=payload.get("total"))

    result = {
        "status": STATUS_OK,
        "records": records,
        "count": len(records),
        "total_available": payload.get("total"),
        "source": "data.gov.in AGMARKNET",
        "unit": "INR/quintal",
        "cached": False,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": ("These are wholesale mandi rates reported to AGMARKNET. "
                       "The price you actually receive depends on quality, "
                       "quantity, grading and negotiation."),
        "sample_key": used_sample_key,
    }
    if used_sample_key:
        result["sample_key_notice"] = SAMPLE_KEY_NOTICE

    if use_cache:
        _cache[cache_key] = {"cached_at": time.time(), "payload": result}
    return result


def summarise(result: Dict[str, Any], crop: str = "") -> Dict[str, Any]:
    """Reduce many market rows to one headline figure plus the best market.

    Deterministic arithmetic — no model involvement.
    """
    if result.get("status") != STATUS_OK or not result.get("records"):
        return {"status": result.get("status", STATUS_UNAVAILABLE),
                "message": result.get("message", ""), "crop": crop,
                "sample_key": result.get("sample_key", False),
                "sample_key_notice": result.get("sample_key_notice")}

    records = result["records"]
    modals = [r["modal_price"] for r in records if r["modal_price"] is not None]
    best = max(records, key=lambda r: r["modal_price"])

    dates = sorted({r["arrival_date"] for r in records if r["arrival_date"]})

    return {
        "status": STATUS_OK,
        "crop": crop or records[0]["commodity"],
        "markets_reporting": len(records),
        "modal_min": min(modals),
        "modal_max": max(modals),
        "modal_avg": round(sum(modals) / len(modals), 2),
        "unit": "INR/quintal",
        "best_market": {
            "market": best["market"],
            "district": best["district"],
            "state": best["state"],
            "modal_price": best["modal_price"],
            "min_price": best["min_price"],
            "max_price": best["max_price"],
            "arrival_date": best["arrival_date"],
        },
        "latest_date": dates[-1] if dates else None,
        "cached": result.get("cached", False),
        "source": result["source"],
        "disclaimer": result["disclaimer"],
        "sample_key": result.get("sample_key", False),
        "sample_key_notice": result.get("sample_key_notice"),
    }


def grounded_facts(summary: Dict[str, Any]) -> List[str]:
    """Fact lines for the agent. Status is stated in words so the model cannot
    present missing data as a real price."""
    if summary.get("status") != STATUS_OK:
        return [f"Mandi price for {summary.get('crop') or 'this crop'}: "
                f"DATA UNAVAILABLE. {summary.get('message', '')} "
                f"Tell the farmer the live price could not be retrieved and to "
                f"check their local mandi. Do NOT state any price figure."]

    b = summary["best_market"]
    return [
        f"Mandi price source: data.gov.in AGMARKNET (real government data).",
        f"Crop: {summary['crop']}",
        f"{summary['markets_reporting']} market(s) reporting on "
        f"{summary['latest_date']}",
        f"Modal price range across markets: INR {summary['modal_min']:.0f} to "
        f"{summary['modal_max']:.0f} per quintal (average "
        f"{summary['modal_avg']:.0f})",
        f"Highest modal price: INR {b['modal_price']:.0f} at {b['market']}, "
        f"{b['district']}, {b['state']}",
        "These figures are already retrieved. Do NOT invent or adjust any "
        "price. State clearly that the actual selling price varies with "
        "quality, quantity and negotiation.",
    ]


async def fetch_bulk_by_commodity(
    commodities: List[str], *, state: str = "", limit: int = 1000
) -> Dict[str, Dict[str, Any]]:
    """Prices for many crops in ONE API call, grouped by our crop key.

    The advisory engine previously looped over crops and issued a separate
    request per crop, each with up to 3 retries. Five crops meant up to
    fifteen sequential HTTP calls before the farmer saw anything, which is
    both very slow and the fastest way to hit a rate limit — the "server
    busy" symptom.

    One wide request filtered by state, grouped locally, is dramatically
    faster and far kinder to the API.
    """
    wanted = {c: canonical_commodity(c) for c in commodities}

    raw = await fetch_prices(state=state, limit=limit)

    out: Dict[str, Dict[str, Any]] = {}
    if raw.get("status") != STATUS_OK:
        for key in commodities:
            out[key] = {"status": raw.get("status", STATUS_UNAVAILABLE),
                        "message": raw.get("message", ""), "crop": key}
        return out

    records = raw["records"]
    for key, api_name in wanted.items():
        want = api_name.strip().lower()
        subset = [r for r in records
                  if want in r["commodity"].strip().lower()
                  or r["commodity"].strip().lower() in want]
        if subset:
            out[key] = summarise({**raw, "records": subset}, key)
        else:
            out[key] = {
                "status": STATUS_EMPTY, "crop": key,
                "message": f"No mandi reported {api_name} in this state today.",
            }
    return out


def clear_cache() -> None:
    _cache.clear()


async def prewarm_common(states: Optional[List[str]] = None) -> Dict[str, Any]:
    """Force-refresh the cache for the platform's most-asked-for prices.

    Called once every morning by the background scheduler in main.py (and
    on demand by the admin "refresh now" endpoint), so a farmer's FIRST
    request of the day is a cache hit — instant — with today's price,
    instead of every farmer's first click of the morning independently
    triggering (and waiting on) its own live data.gov.in round trip.

    Bounded and sequential on purpose: this hits a public rate-limited API,
    so it fetches one nationwide sweep per state (or one nationwide-only
    sweep if no states are given) rather than one call per commodity — a
    single fetch_prices() call already returns many commodities at once,
    which fetch_bulk_by_commodity's grouping then slices locally.
    """
    started = time.time()
    targets = states or [""]  # "" = nationwide, no state filter
    results: Dict[str, str] = {}
    for state in targets:
        label = state or "(nationwide)"
        try:
            res = await fetch_prices(state=state, limit=1000, force_refresh=True)
            results[label] = res.get("status", "unknown")
        except Exception as exc:  # never let one bad state abort the sweep
            log.warning("prewarm failed for %s: %s", label, exc)
            results[label] = "error"
    summary = {
        "swept": list(results.keys()),
        "results": results,
        "duration_s": round(time.time() - started, 1),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    log.info("mandi prewarm complete: %s", summary)
    return summary
