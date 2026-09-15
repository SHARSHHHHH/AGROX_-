"""Deterministic triage for farmer-submitted emergency reports.

Same shape as the rest of this project's agent design (see
app/agents/agent.py): a fixed chain of tools runs first and produces the
actual decision — which severity, which relief channel — and none of it is
invented by an LLM. This file has no network calls and no model calls; it is
plain, testable, auditable Python, which matters a lot more here than for a
recommendation, because a report that under-states an emergency's severity
could mean help arrives too slowly.
"""
from typing import Optional

# Baseline severity for the disaster TYPE alone, before reading anything the
# farmer wrote. Fire starts at CRITICAL because a field fire can outrun a
# response if under-triaged; drought starts one notch below flood/pest
# because thirst develops over days, not minutes.
BASE_SEVERITY = {
    "flood": "HIGH",
    "drought": "MODERATE",
    "pest": "MODERATE",
    "disease": "MODERATE",
    "fire": "CRITICAL",
    "other": "MODERATE",
}

# Phrases that, if present, mean the written description itself is asking
# for more urgency than the disaster type's baseline assumes. Kept short and
# literal on purpose — a keyword list is auditable; a model guessing "how
# urgent does this sound" is not, and this is exactly the kind of number a
# wrong guess would hurt.
_ESCALATE_TERMS = [
    "entire field", "whole farm", "whole field", "all my crop", "all my crops",
    "everything", "total loss", "completely destroyed", "spreading fast",
    "spreading quickly", "many days", "several days", "no water for",
    "house", "family", "children", "trapped", "collapsed", "injured",
    "urgent", "emergency", "immediately", "dying", "died",
]

_LEVELS = ["LOW", "MODERATE", "HIGH", "CRITICAL"]


def _escalate(level: str) -> str:
    i = _LEVELS.index(level) if level in _LEVELS else 1
    return _LEVELS[min(i + 1, len(_LEVELS) - 1)]


def assess(disaster_type: str, description: str,
           vision_hint: Optional[dict] = None) -> dict:
    """Combines disaster type, the farmer's own words, and (optionally) a
    photo analysis already computed by the plant/pest vision pipeline, into
    one severity level with a plain-language reason.

    Never returns anything the caller didn't already have a concrete source
    for — no field here is a free-form model guess.
    """
    level = BASE_SEVERITY.get(disaster_type, "MODERATE")
    reasons = [f"Reported disaster type: {disaster_type}, baseline severity {level}."]
    escalated = False

    text = (description or "").lower()
    hit = next((term for term in _ESCALATE_TERMS if term in text), None)
    if hit:
        level = _escalate(level)
        escalated = True
        reasons.append(f"Description language (\"{hit}\") indicates broader or "
                       f"more urgent impact than the disaster type alone implies.")

    if vision_hint:
        vs = str(vision_hint.get("severity") or "").lower()
        if vs in ("high", "severe", "critical"):
            level = _escalate(level)
            escalated = True
            label = vision_hint.get("label") or "the uploaded photo"
            reasons.append(f"Photo analysis independently flagged high severity ({label}).")

    return {"level": level, "reason": " ".join(reasons), "escalated": escalated}


def route(level: str, state: str = "", district: str = "") -> dict:
    """Decides which real-world channel this report is routed to.

    HIGH/CRITICAL goes to the state-level relief cell (bigger, faster-moving
    events); everything else goes to the district agriculture office. Either
    way this platform's actual "government side" is the Admin Command
    Center — see alerts_admin.py — so routing here determines how the report
    is labelled and prioritised there, not a call to any external system.
    """
    if level in ("HIGH", "CRITICAL"):
        channel = "State Disaster Relief Cell"
        location = state or "state pending"
    else:
        channel = "District Agriculture Office"
        location = district or state or "district pending"
    return {"channel": channel, "location": location, "label": f"{channel} — {location}"}
