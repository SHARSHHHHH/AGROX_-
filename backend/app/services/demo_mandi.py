"""HACKATHON DEMO FALLBACK — simulated mandi prices, never real.

WHY THIS EXISTS
---------------
The real integration (app/services/mandi_price.py, AGMARKNET via
data.gov.in) is free, live, and fully wired — no subscription needed,
just a personal API key from https://data.gov.in. But a hackathon demo
can't depend on a live government API's uptime, network reachability from
wherever it's hosted, or a farmer having had time to register a key yet.

So when the real fetch fails for ANY reason (not configured, timed out,
unreachable, no data today), and ONLY if settings.DEMO_MODE_FALLBACK is on,
the app shows plausible, clearly-labeled simulated prices instead of a dead
"no data" screen — enough to demonstrate the actual feature working.

THE ONE RULE THAT MATTERS: this must never be mistaken for real data.
- status is "demo", never "ok" — every consumer must treat it differently.
- Every response carries `is_simulated: True` and a `demo_notice` explaining
  exactly what happened and how to get the real thing.
- The frontend must render this with a distinct, unmissable badge/banner
  (see Market.tsx) — not the same green "live" styling as a real price.
- DEMO_MODE_FALLBACK defaults to on for this hackathon build, but is a
  single settings flag (see app/core/config.py) — turn it off before
  showing this to an actual farmer with money on the line.

The ~12s delay before returning is deliberate: it mirrors what checking a
real live feed actually feels like, so the demo reads as "the app is doing
real work", not a bag of numbers loaded instantly.
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("agri.market.demo")

STATUS_DEMO = "demo"

DEMO_FETCH_DELAY_SECONDS = 12.0

DEMO_NOTICE = (
    "⚠ SIMULATED prices — not a real government feed. The real integration "
    "(AGMARKNET via data.gov.in) is fully built and free to use; it just "
    "wasn't reachable this time (no personal API key set yet, or a network/"
    "timeout issue). Register a free key at https://data.gov.in and real "
    "prices appear automatically — no code changes needed."
)

# Rough, illustrative INR/quintal ranges for common commodities — order of
# magnitude only, for a believable demo, NOT sourced from any real feed and
# NOT claimed to be accurate for any specific date. Keyed by the same
# canonical AGMARKNET display names mandi_price.py already uses, so a
# lookup by canonical_commodity() output just works.
DEMO_BASE_PRICE: Dict[str, float] = {
    "Soyabean": 4650, "Wheat": 2380, "Rice": 2150,
    "Paddy(Dhan)(Common)": 2100, "Maize": 2050, "Jowar(Sorghum)": 3100,
    "Bajra(Pearl Millet/Cumbu)": 2250, "Barley (Jau)": 1950,
    "Ragi (Finger Millet)": 3700,
    "Bengal Gram(Gram)(Whole)": 5600, "Arhar (Tur/Red Gram)(Whole)": 9800,
    "Green Gram (Moong)(Whole)": 8200, "Black Gram (Urd Beans)(Whole)": 7400,
    "Masur Dal": 6300, "Peas(Dry)": 4200,
    "Cotton": 7200, "Mustard": 5400, "Groundnut": 6100,
    "Sesamum(Sesame,Gingelly,Til)": 12500, "Sunflower": 6600,
    "Linseed": 6800, "Castor Seed": 6200,
    "Tomato": 1600, "Potato": 1350, "Onion": 1550,
    "Cauliflower": 1400, "Cabbage": 900, "Carrot": 1800,
    "Brinjal": 1500, "Green Chilli": 3800, "Bhindi(Ladies Finger)": 2200,
    "Garlic": 6500, "Ginger(Green)": 4500, "Spinach": 1200,
    "Banana": 1500, "Mango": 3200, "Papaya": 1100, "Guava": 2400,
    "Orange": 3600,
    "default": 2500,
}

DEMO_MARKET_NAMES = [
    "Main APMC Mandi", "District Wholesale Market",
    "Rural Krishi Upaj Mandi", "Central Mandi Yard", "Taluka Mandi Samiti",
]


def _seeded_rng(*parts: Any) -> random.Random:
    """Same seed all day for the same query, so repeated checks look
    consistent (like a real day's price) rather than jittering on every
    click, which would read as obviously fake."""
    today = datetime.now(timezone.utc).date().isoformat()
    seed = "|".join(str(p) for p in parts) + "|" + today
    return random.Random(seed)


async def demo_summary(commodity_display: str, state: str = "",
                       crop_key: str = "") -> Dict[str, Any]:
    """Simulated equivalent of mandi_price.summarise()'s "ok" shape.

    Same field names as the real summary (best_market, modal_min/max/avg,
    markets_reporting, latest_date, ...) so the frontend needs zero special
    casing beyond checking `status == "demo"` for the badge — but status,
    source and demo_notice make it unmistakable which one this is.
    """
    await asyncio.sleep(DEMO_FETCH_DELAY_SECONDS)

    rng = _seeded_rng(commodity_display, state or "nationwide")
    base = DEMO_BASE_PRICE.get(commodity_display, DEMO_BASE_PRICE["default"])

    n_markets = rng.randint(3, 5)
    markets = []
    for i in range(n_markets):
        jitter = rng.uniform(-0.07, 0.07)
        modal = round(base * (1 + jitter) / 10) * 10  # nearest 10
        spread = max(10, round(modal * rng.uniform(0.02, 0.06) / 10) * 10)
        name = DEMO_MARKET_NAMES[i % len(DEMO_MARKET_NAMES)]
        if i >= len(DEMO_MARKET_NAMES):
            name = f"{name} {i + 1}"
        markets.append({
            "market": name,
            "district": state or "Demo District",
            "state": state or "All-India (simulated)",
            "modal_price": modal,
            "min_price": modal - spread,
            "max_price": modal + spread,
            "arrival_date": datetime.now(timezone.utc).date().isoformat(),
        })

    modals = [m["modal_price"] for m in markets]
    best = max(markets, key=lambda m: m["modal_price"])
    today_iso = datetime.now(timezone.utc).date().isoformat()

    log.info("Serving SIMULATED demo price for %s/%s — real feed unavailable",
             commodity_display, state or "(nationwide)")

    return {
        "status": STATUS_DEMO,
        "is_simulated": True,
        "crop": crop_key or commodity_display,
        "markets_reporting": len(markets),
        "modal_min": min(modals),
        "modal_max": max(modals),
        "modal_avg": round(sum(modals) / len(modals), 2),
        "unit": "INR/quintal",
        "best_market": best,
        "latest_date": today_iso,
        "cached": False,
        "source": "SIMULATED DEMO DATA (not a real government feed)",
        "disclaimer": ("These figures are simulated for demonstration "
                      "purposes and do not reflect real market conditions."),
        "demo_notice": DEMO_NOTICE,
    }
