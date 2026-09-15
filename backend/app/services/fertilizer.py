"""Fertilizer reference prices and a transparent ROI calculation.

WHY THERE IS NO "LIVE VENDOR OFFERS NEARBY" FEED
-------------------------------------------------
A farmer-to-farmer marketplace-style "offers near you" feed only exists if
either (a) local dealers register on a portal (none does, publicly, in
India) or (b) a government API publishes it live. Neither exists. Unlike
mandi crop prices — which AGMARKNET genuinely re-publishes daily via
data.gov.in (see app/services/mandi_price.py) — retail fertilizer prices in
India are not a daily market feed at all: for controlled fertilizers
(Urea) and Nutrient-Based-Subsidy fertilizers (DAP, MOP, NPK complexes),
the Government of India instead NOTIFIES a Maximum Retail Price (MRP) that
by law no dealer may exceed, revised only occasionally (typically per
cropping season) via Department of Fertilizers / PIB announcements — not a
queryable API.

So instead of a live "offers nearby" list, this service gives the farmer
the one real, government-backed number that exists: the current notified
MRP ceiling for the major fertilizers, sourced and dated below. That number
is exactly what "is this offer worth it?" actually needs — a real vendor
quote is only a good deal if it's at or below this ceiling; anything above
it is not just a bad deal, it is unlawful overcharging.

TWO HARD RULES (unchanged from before)
---------------------------------------
1. A price is never invented. Every number below is dated and cited; if a
   product isn't in GOVT_MRP_REFERENCE, the response says "no reference
   price available" rather than guessing.
2. The ROI arithmetic is deterministic and fully itemised. The LLM receives
   the finished numbers and may only phrase them — it never computes,
   adjusts or rounds a figure a farmer will spend money on.

"WORTH IT" FORMULA — see calculate_roi()'s own docstring for the full
reasoning, but in short: it is judged purely on price and travel cost, kept
deliberately separate from any speculative yield/harvest estimate:

    transport      = distance_km * 2 * rate_per_km        (round trip)
    cost_at_offer  = offer_price * bags + transport
    cost_at_normal = standard_price * bags
    net_saving     = cost_at_normal - cost_at_offer
    worth_it       = net_saving > 0 AND offer_price <= government MRP

A SEPARATE, optional "potential extra income" estimate (yield boost * crop
price) is also returned when a crop price is available, but it never
affects worth_it above — see calculate_roi()'s docstring for why mixing the
two produced nonsensical verdicts in an earlier version of this file.

YIELD BOOST CAVEAT
------------------
yield_boost_t_per_acre is the weakest input in this calculation. Organic
manure response varies enormously with soil carbon, rainfall and crop. The
defaults below are conservative placeholders and are labelled as
assumptions in the output. Replace them with trial data from your state
agricultural university before presenting this as financial advice.
"""

import logging
from typing import List, Optional

log = logging.getLogger("agri.fertilizer")

STATUS_OK = "ok"
STATUS_UNAVAILABLE = "unavailable"
# A real number, but not a "live" one in the mandi-price sense above — a
# government-notified ceiling price, refreshed only when Delhi announces a
# change. Kept distinct from STATUS_OK (used everywhere else for "we made a
# live network call just now") so the UI can honestly label it as such.
STATUS_REFERENCE = "reference"

# Default transport assumption for a small tractor-trailer or hired tempo.
DEFAULT_TRANSPORT_RATE_PER_KM = 25.0   # INR per km, one way

# Conservative assumed yield response to a full recommended dose of organic
# manure, in tonnes per acre. LABELLED AS AN ASSUMPTION in every response.
ASSUMED_YIELD_BOOST_T_PER_ACRE = {
    "soybean": 0.08,
    "wheat": 0.12,
    "chickpea": 0.06,
    "maize": 0.15,
    "cotton": 0.10,
    "default": 0.08,
}

# Government of India, Department of Fertilizers — notified/regulated
# Maximum Retail Price (MRP). No dealer may lawfully sell above this.
#
# SOURCES (checked against multiple independent reports, not a single
# blog, given how often "current fertilizer price" pages online are stale
# or region-specific):
#   - Urea (statutory MRP, neem-coated, all of India): PIB press release
#     and Dept. of Fertilizers briefing, reconfirmed April 2026 —
#     https://www.pib.gov.in (Dept. of Fertilizers briefing, Apr 2026)
#   - DAP (Nutrient Based Subsidy, Rabi 2025-26 / unchanged Kharif 2026):
#     DD News, https://ddnews.gov.in — "Centre keeps DAP price at ₹1,350
#     per bag for Rabi 2025-26"; reconfirmed for Kharif 2026 by the NBS
#     cabinet decision (₹41,533.81 crore outlay, Apr-Sep 2026).
#   - MOP, NPK 10:26:26, NPK 12:32:16 (NBS 2025-26 average retail price):
#     same DD News report.
#
# THESE ARE NOT UPDATED BY THE DAILY MORNING REFRESH JOB (see
# app/services/mandi_price.py's prewarm) — MRPs change by government
# notification, not daily trading, so they are reviewed and updated in code
# whenever a new notification is announced, with the date below moved
# forward. If your MRP reference looks out of date, check
# https://www.dbtbharat.gov.in or https://urvarak.co.in for the current
# notification before trusting the number below.
GOVT_MRP_REFERENCE = [
    {"product": "Urea (neem-coated)", "bag_kg": 45, "mrp": 266.50,
     "effective": "2026-04", "scheme": "Statutory MRP (Government-controlled)"},
    {"product": "DAP (Di-Ammonium Phosphate)", "bag_kg": 50, "mrp": 1350.00,
     "effective": "2026-04", "scheme": "Nutrient Based Subsidy (NBS), Kharif 2026"},
    {"product": "MOP (Muriate of Potash)", "bag_kg": 50, "mrp": 1710.54,
     "effective": "2025-10", "scheme": "Nutrient Based Subsidy (NBS), 2025-26"},
    {"product": "NPK 10:26:26", "bag_kg": 50, "mrp": 1814.82,
     "effective": "2025-10", "scheme": "Nutrient Based Subsidy (NBS), 2025-26"},
    {"product": "NPK 12:32:16", "bag_kg": 50, "mrp": 1711.87,
     "effective": "2025-10", "scheme": "Nutrient Based Subsidy (NBS), 2025-26"},
]
MRP_SOURCE_NOTE = (
    "Government of India, Department of Fertilizers — notified Maximum "
    "Retail Price. This is a regulated ceiling, not a live market feed: it "
    "changes only when the government issues a new notification "
    "(typically once or twice a year), not daily. No dealer may lawfully "
    "charge more than this for the listed product. Verify the latest "
    "notification at https://urvarak.co.in before relying on it for a "
    "large purchase."
)


def find_mrp(product: str) -> Optional[dict]:
    """Loose match: 'dap' or 'DAP 50kg' both find the DAP row."""
    if not product:
        return None
    want = product.strip().lower()
    for row in GOVT_MRP_REFERENCE:
        name = row["product"].lower()
        if want in name or name.split(" ")[0].lower() in want:
            return row
    return None


async def get_offers(state: str = "", product: str = "") -> dict:
    """Government-notified MRP reference — NOT live vendor offers.

    There is no live "offers nearby" source (see module docstring), so this
    never returns mock data. It returns the real MRP reference table,
    optionally filtered to one product, clearly labelled as a regulated
    ceiling price rather than a personalised deal.
    """
    rows = [dict(r) for r in GOVT_MRP_REFERENCE]
    if product:
        want = product.strip().lower()
        rows = [r for r in rows if want in r["product"].lower()]

    if not rows:
        return {
            "status": STATUS_UNAVAILABLE, "state": state, "reference": [],
            "message": (f"No government MRP reference is on file for "
                       f"'{product}'. Known products: " +
                       ", ".join(r["product"] for r in GOVT_MRP_REFERENCE)),
        }

    return {
        "status": STATUS_REFERENCE,
        "state": state,
        "reference": rows,
        "source": "Government of India, Department of Fertilizers",
        "note": MRP_SOURCE_NOTE,
    }


def calculate_roi(*, offer_price: float, standard_price: float, bags: int,
                  distance_km: float, crop: str = "default",
                  acres: float = 1.0,
                  crop_price_per_tonne: Optional[float] = None,
                  transport_rate_per_km: float = DEFAULT_TRANSPORT_RATE_PER_KM,
                  product: str = "",
                  ) -> dict:
    """Is this fertilizer offer actually worth buying — and worth the trip?

    THE QUESTION THIS ANSWERS (and the one it deliberately does NOT):

    "Is this offer worth it?" means: compared to paying the normal price,
    does buying at THIS price — after accounting for the fuel/time cost of
    getting there — actually save money?

        cost_at_offer  = offer_price * bags + round-trip transport
        cost_at_normal = standard_price * bags   (buying at the normal
                                                   price, no special trip)
        net_saving     = cost_at_normal - cost_at_offer
        worth_it       = net_saving > 0

    That's it. A ₹0.50/bag discount on 1 bag with no travel needed (net
    saving ₹0.50) IS worth it, marginal as it is — it does not need a
    farm's entire yield economics to justify a discount that small.

    This deliberately does NOT fold in "how much extra income might this
    fertilizer generate from a better harvest" — that is a separate,
    speculative agronomic question (see `potential_extra_income` below),
    not a purchasing decision. An earlier version of this function DID mix
    the two together, and the result was nonsensical from a farmer's point
    of view: a small, genuine discount on the PRICE could come out "not
    worth it" purely because the unrelated yield estimate was zero (no
    live crop price) or too small to outweigh the bag's full sticker cost.
    Judging "is ₹266 vs ₹266.50 a good price" should never depend on a
    guess about this season's harvest.

    ROI formula, every term returned, nothing hidden:
        cost_at_offer  = offer_price * bags + transport
        transport      = distance_km * 2 * rate_per_km   (round trip)
        cost_at_normal = standard_price * bags
        net_saving     = cost_at_normal - cost_at_offer
        worth_it       = net_saving > 0 AND offer_price <= government MRP
                         (if a real MRP reference is matched)

    potential_extra_income (separate, optional, NOT part of worth_it):
        extra_tonnes = yield_boost_t_per_acre * acres
        income       = extra_tonnes * crop_price_per_tonne (if known)

    YIELD BOOST CAVEAT
    ------------------
    yield_boost_t_per_acre is the weakest input in this file. Organic
    manure response varies enormously with soil carbon, rainfall and crop.
    The defaults below are conservative placeholders, labelled as
    assumptions, and never used to call an offer "worth it" — only ever
    shown as an extra, clearly-separate FYI number.
    """

    bags = max(0, int(bags))
    acres = max(0.0, float(acres))
    distance_km = max(0.0, float(distance_km))

    # --- the actual purchasing decision ---
    purchase_cost = round(offer_price * bags, 2)
    transport_cost = round(distance_km * 2 * transport_rate_per_km, 2)
    cost_at_offer = round(purchase_cost + transport_cost, 2)
    cost_at_normal = round(standard_price * bags, 2)
    net_saving = round(cost_at_normal - cost_at_offer, 2)
    worth_it = net_saving > 0
    per_bag_saving = round(standard_price - offer_price, 2)

    assumptions = [
        f"Transport assumed at INR {transport_rate_per_km:.0f} per km, round "
        f"trip over {distance_km:.0f} km.",
    ]

    # --- real-world sanity check against the government MRP ceiling ---
    # The single most useful "is this offer worth it?" fact available for a
    # branded/subsidised product: an offer AT or below MRP is normal; one
    # ABOVE MRP is not a negotiable deal, it is unlawful — and overrides the
    # arithmetic above regardless of how good the discount looks.
    mrp_row = find_mrp(product or crop)
    mrp_flag = None
    if mrp_row:
        if offer_price > mrp_row["mrp"]:
            worth_it = False
            mrp_flag = (
                f"⚠ This offer (₹{offer_price:,.2f}/bag) is ABOVE the "
                f"government-notified MRP of ₹{mrp_row['mrp']:,.2f} for "
                f"{mrp_row['product']} ({mrp_row['bag_kg']} kg bag, "
                f"{mrp_row['scheme']}). No dealer may lawfully charge more "
                f"than the MRP — report this to the fertilizer helpline "
                f"1800-180-1551.")
        else:
            mrp_flag = (
                f"This offer (₹{offer_price:,.2f}/bag) is at or below the "
                f"government MRP of ₹{mrp_row['mrp']:,.2f} for "
                f"{mrp_row['product']} — lawful and in the expected range.")
        assumptions.append(mrp_flag)

    verdict = (
        f"Buying {bags} bag(s) at ₹{offer_price:,.0f}/bag instead of the "
        f"normal ₹{standard_price:,.0f}/bag "
        f"{'saves' if net_saving >= 0 else 'costs'} about ₹{abs(net_saving):,.0f} "
        f"overall, including the {distance_km:.0f} km round trip.")
    if mrp_row and offer_price > mrp_row["mrp"]:
        verdict = "This price is above the legal MRP ceiling — do not pay it. " + verdict

    # How far you could travel before the trip itself eats the whole
    # per-bag saving (independent of the MRP check above).
    raw_saving = round(per_bag_saving * bags, 2)
    if transport_rate_per_km > 0 and raw_saving > 0:
        break_even_km = round(raw_saving / (2 * transport_rate_per_km), 1)
    else:
        break_even_km = 0.0

    # --- SEPARATE, optional: potential extra income from a yield boost ---
    # Explicitly does not affect worth_it — see the docstring above.
    boost_per_acre = ASSUMED_YIELD_BOOST_T_PER_ACRE.get(
        crop.lower(), ASSUMED_YIELD_BOOST_T_PER_ACRE["default"])
    extra_tonnes = round(boost_per_acre * acres, 3)

    if crop_price_per_tonne is None:
        potential_extra_income = None
        yield_counted = False
        revenue_note = (
            "No live crop price is available right now, so a potential "
            "extra-income estimate can't be shown — this does NOT affect "
            "whether the offer itself is worth it above, which is judged "
            "purely on price and transport.")
    else:
        potential_extra_income = round(extra_tonnes * crop_price_per_tonne, 2)
        yield_counted = True
        revenue_note = (
            f"If applied at a full recommended dose to {acres:g} acre(s) of "
            f"{crop}, a conservative assumed yield response of "
            f"{boost_per_acre} t/acre could bring roughly "
            f"₹{potential_extra_income:,.0f} in extra income at today's crop "
            f"price of ₹{crop_price_per_tonne:,.0f}/tonne — a separate, "
            f"speculative bonus on top of the price verdict above, not part "
            f"of it.")
    assumptions.append(
        f"Assumed yield response of {boost_per_acre} t/acre for {crop} if "
        f"used on that crop — a conservative placeholder, not trial data "
        f"for your field, and never counted in the worth-it verdict above.")

    return {
        "worth_it": worth_it,
        "net_saving": net_saving,
        "currency": "INR",
        "breakdown": {
            "purchase_cost": purchase_cost,
            "transport_cost": transport_cost,
            "cost_at_offer": cost_at_offer,
            "cost_at_normal": cost_at_normal,
            "per_bag_saving": per_bag_saving,
            "bags": bags,
            "acres": acres,
            "distance_km": distance_km,
        },
        "potential_extra_income": potential_extra_income,
        "extra_tonnes": extra_tonnes,
        "yield_revenue_counted": yield_counted,
        "revenue_note": revenue_note,
        "break_even_distance_km": break_even_km,
        "mrp_reference": mrp_row,
        "mrp_flag": mrp_flag,
        "assumptions": assumptions,
        "verdict": verdict,
        "disclaimer": ("This is an arithmetic estimate from the figures shown, "
                       "not a guarantee. The 'worth it' verdict is based "
                       "purely on price and travel cost — the potential "
                       "extra income figure (if shown) is a separate, "
                       "speculative bonus, not a condition of that verdict."),
    }


def grounded_facts(roi: dict) -> List[str]:
    """Fact lines for the agent. The model phrases these; it never recomputes."""
    b = roi["breakdown"]
    facts = [
        f"Worth-it verdict: {'WORTH IT' if roi['worth_it'] else 'NOT WORTH IT'}",
        f"Net saving vs buying at the normal price: INR {roi['net_saving']:,.2f}",
        f"Cost if bought at the offer price: INR {b['cost_at_offer']:,.2f} "
        f"({b['bags']} bag(s) at the offer price, plus INR "
        f"{b['transport_cost']:,.2f} transport for {b['distance_km']} km "
        f"round trip)",
        f"Cost if bought at the normal price instead: INR "
        f"{b['cost_at_normal']:,.2f}",
    ]

    if roi.get("mrp_flag"):
        facts.append(f"Government MRP check: {roi['mrp_flag']}")

    facts.append(f"Break-even distance (before the trip cancels out the "
                 f"saving): {roi['break_even_distance_km']} km")

    if roi["yield_revenue_counted"]:
        facts.append(
            f"SEPARATE, optional estimate — NOT part of the worth-it "
            f"verdict: potential extra income of INR "
            f"{roi['potential_extra_income']:,.2f} from an assumed yield "
            f"boost of {roi['extra_tonnes']} extra tonnes, IF this is being "
            f"used on the stated crop.")
    else:
        facts.append("No potential-extra-income estimate is available "
                     "(crop price unavailable) — this does NOT affect the "
                     "worth-it verdict, which is price/transport only.")

    facts.append("These figures are already calculated. Do NOT recalculate, "
                 "adjust or round them, and do NOT let the optional "
                 "extra-income estimate change the worth-it verdict.")
    return facts
