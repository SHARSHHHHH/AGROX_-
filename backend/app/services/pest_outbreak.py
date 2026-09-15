"""Pest outbreak detection and AI-drafted official reports.

PIPELINE (Section 24-style: tools gather facts, the LLM only explains them)
-----------------------------------------------------------------------------
1. detect_outbreak()   — deterministic DB query. Finds the pest/crop cluster
                          with the most distinct affected farmers in a
                          state/district within a rolling window. A real
                          tool call, not a guess.
2. draft_report()      — takes the facts detect_outbreak() found and asks
                          the LLM to phrase them as a formal report. The
                          prompt hard-instructs it to use ONLY the given
                          numbers — it is explicitly told it may not invent
                          statistics, dates, or claims. If the LLM call
                          fails, a template-based fallback report is used
                          instead of blocking the pipeline — the report is
                          never silently skipped.

SIMULATED VS REAL
-----------------------------------------------------------------------------
The threshold from the spec is "10+ farmers report the same pest nearby."
This platform's seed data has smaller real clusters (1-3 farmers per pest,
per district) — nowhere near 10. Rather than only working when the demo
happens to have exactly the right data, or silently inventing farmer counts
to hit 10, every report this pipeline produces carries an explicit
`simulated` flag:
  - simulated=False: a real cluster in the DB already met the threshold.
  - simulated=True:  the real pest/crop/district combination found is used
                      as-is (so the report is about a genuine, currently-
                      reported problem), but the affected-farmer count is
                      scaled up to the requested threshold and clearly
                      labelled "SIMULATED SCENARIO" throughout the report,
                      the UI, and the PDF. This mirrors how the rest of the
                      Scenario Simulator already frames itself: "estimates
                      based on current data — a scenario simulation, not a
                      guaranteed real-world outcome."
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import PestObservation, User, Farm
from app.ai import llm

OUTBREAK_THRESHOLD = 10
WINDOW_DAYS = 30


def detect_outbreak(db: Session, state: str, district: str = "",
                    pest_name: str = "", threshold: int = OUTBREAK_THRESHOLD) -> dict:
    """Real tool call #1: find the pest/crop cluster with the most distinct
    affected farmers in `state`(/`district`) within the last WINDOW_DAYS.
    Never invents a cluster that isn't in the data — if nothing is found at
    all, says so.
    """
    since = datetime.utcnow() - timedelta(days=WINDOW_DAYS)
    q = (db.query(PestObservation.pest_name, PestObservation.crop,
                 func.count(func.distinct(PestObservation.user_id)).label("farmers"))
        .join(User, PestObservation.user_id == User.id)
        .filter(User.state == state, PestObservation.created_at >= since,
               PestObservation.pest_name.isnot(None)))
    if district:
        q = q.filter(User.district == district)
    if pest_name:
        q = q.filter(PestObservation.pest_name == pest_name)
    q = q.group_by(PestObservation.pest_name, PestObservation.crop)
    q = q.order_by(func.count(func.distinct(PestObservation.user_id)).desc())
    top = q.first()

    if not top:
        return {"found": False, "reason": "No pest/disease reports found for this area in the last "
                                          f"{WINDOW_DAYS} days."}

    top_pest, top_crop, farmer_count = top

    # The actual affected farmers, for real facts (severity, districts, IDs).
    obs_q = (db.query(PestObservation).join(User, PestObservation.user_id == User.id)
            .filter(User.state == state, PestObservation.pest_name == top_pest,
                   PestObservation.crop == top_crop, PestObservation.created_at >= since))
    if district:
        obs_q = obs_q.filter(User.district == district)
    observations = obs_q.all()

    severities = [o.severity for o in observations if o.severity]
    districts_hit = sorted({o.user.district for o in observations if o.user and o.user.district})
    farm_rows = (db.query(Farm).join(User, Farm.user_id == User.id)
                .filter(User.id.in_({o.user_id for o in observations})).all())
    avg_acres = round(sum(f.land_size_acres or 0 for f in farm_rows) / len(farm_rows), 1) if farm_rows else None

    return {
        "found": True, "pest_name": top_pest, "crop": top_crop,
        "real_farmer_count": farmer_count, "districts_hit": districts_hit,
        "severity_counts": {s: severities.count(s) for s in set(severities)},
        "avg_land_size_acres": avg_acres,
        "sample_recommendation": next((o.recommendation for o in observations if o.recommendation), ""),
        "window_days": WINDOW_DAYS,
    }


def build_outbreak_scenario(db: Session, state: str, district: str = "",
                            pest_name: str = "", threshold: int = OUTBREAK_THRESHOLD) -> dict:
    """Wraps detect_outbreak() with the simulate-to-threshold logic described
    in the module docstring. This is what the Scenario Simulator button
    calls — always returns a usable scenario, real or clearly-labelled
    simulated, never a dead end.
    """
    facts = detect_outbreak(db, state, district, pest_name, threshold)
    if not facts["found"]:
        return {"found": False, "reason": facts["reason"], "simulated": None}

    real_count = facts["real_farmer_count"]
    simulated = real_count < threshold
    affected_count = max(real_count, threshold) if simulated else real_count

    # Estimated exposure — computed, not invented: affected farmers x their
    # own average land size = acreage under potential threat. No rupee
    # damage figure is fabricated; acreage is as far as real inputs allow.
    acres_at_risk = (round(facts["avg_land_size_acres"] * affected_count, 1)
                     if facts["avg_land_size_acres"] else None)

    return {
        "found": True, "simulated": simulated,
        "state": state, "district": district or ", ".join(facts["districts_hit"]) or "multiple districts",
        "pest_name": facts["pest_name"], "crop": facts["crop"],
        "real_farmer_count": real_count, "affected_farmer_count": affected_count,
        "threshold": threshold, "districts_hit": facts["districts_hit"],
        "severity_counts": facts["severity_counts"],
        "avg_land_size_acres": facts["avg_land_size_acres"],
        "acres_at_risk": acres_at_risk,
        "sample_recommendation": facts["sample_recommendation"],
        "window_days": facts["window_days"],
    }


_REPORT_SYSTEM_PROMPT = """You are drafting a short official agricultural pest-outbreak
report for a government agriculture officer. You are given a JSON object of VERIFIED
facts gathered by the system's own database queries. Rules:
- Use ONLY the facts given. Do not invent statistics, dates, farmer names, or claims
  not present in the facts.
- If the facts say the scenario is SIMULATED, the report MUST say so plainly near the
  top — do not present a simulated scenario as a confirmed real outbreak.
- Write four short sections with these exact headings: "Situation Summary",
  "Evidence", "Estimated Impact", "Recommended Action".
- Keep it factual and concise (roughly 120-180 words total). No flowery language.
- Do not add a title, date, or signature block — those are added separately."""


async def draft_report(db: Session, scenario: dict) -> dict:
    """Real tool call #2: ask the LLM to phrase the verified facts as a
    formal report. If the LLM is unavailable, falls back to a template so
    the pipeline never silently produces nothing.
    """
    import json
    user_prompt = ("Draft the report from these verified facts:\n" +
                   json.dumps({k: v for k, v in scenario.items() if k not in ("found",)}, indent=2))

    narrative = await llm.chat(_REPORT_SYSTEM_PROMPT, user_prompt, temperature=0.2, max_output_tokens=500)

    # chat() never raises, but can return an explicit failure message if
    # every provider is unavailable — detect that and fall back to a
    # template rather than shipping an error string as an "official report".
    if not narrative or narrative.strip().lower().startswith(("sorry", "error", "i could not", "i couldn't")):
        narrative = _template_report(scenario)

    return {
        "title": f"Pest Outbreak Report — {scenario['pest_name']} ({scenario['crop']})",
        "state": scenario["state"], "district": scenario["district"],
        "generated_at": datetime.utcnow().isoformat(),
        "simulated": scenario["simulated"],
        "facts": scenario,
        "narrative": narrative,
    }


def _template_report(scenario: dict) -> str:
    """Deterministic fallback if the LLM is unavailable — the report still
    gets produced, just without LLM-polished prose."""
    sim_line = ("**SIMULATED SCENARIO — for demonstration purposes; real current reports are "
               f"below the {scenario['threshold']}-farmer threshold.**\n\n") if scenario["simulated"] else ""
    return (
        f"{sim_line}"
        f"Situation Summary\n"
        f"{scenario['affected_farmer_count']} farmers in {scenario['district']}, {scenario['state']} "
        f"have reported {scenario['pest_name']} affecting {scenario['crop']} within the last "
        f"{scenario['window_days']} days.\n\n"
        f"Evidence\n"
        f"Severity breakdown: {scenario['severity_counts'] or 'not recorded'}. "
        f"Districts affected: {', '.join(scenario['districts_hit']) or scenario['district']}.\n\n"
        f"Estimated Impact\n"
        f"Approximately {scenario['acres_at_risk'] or 'an unknown area of'} acres under potential "
        f"threat, based on affected farmers' average land size "
        f"({scenario['avg_land_size_acres'] or 'not recorded'} acres each).\n\n"
        f"Recommended Action\n"
        f"{scenario['sample_recommendation'] or 'Dispatch an agricultural extension officer for field verification.'}"
    )
