"""Plausibility verification and relief-channel matching for disaster reports.

Two independent, deterministic checks — no LLM guessing, matching the rest
of this project's agentic design (see app/agents/agent.py,
app/services/disaster_triage.py):

  1. Location plausibility: does the reported GPS fix sit near the farmer's
     own registered farm? (haversine distance, flagged not rejected — a
     farmer may legitimately report on a second/rented plot.)
  2. Time plausibility: was the GPS fix itself captured recently, or is it a
     stale/cached position being replayed long after the fact?

Then: which currently-active ReliefChannel (if any) this report's disaster
type matches, so the farmer sees a concrete channel name, whether it pays
out, and until when it's open — instead of a vague "filed to the
government".
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import ReliefChannel

# A farmer reporting from more than this many km from their registered farm
# is not rejected — just flagged for a human reviewer to look at twice.
LOCATION_PLAUSIBLE_RADIUS_KM = 30.0

# A GPS fix older than this when it reaches the server is flagged as
# possibly stale (e.g. a cached position from earlier, or a very slow
# multi-step submission) rather than a live, on-the-spot reading.
TIME_PLAUSIBLE_WINDOW_MINUTES = 15


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2)
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def check_location(report_lat: Optional[float], report_lon: Optional[float],
                   farm_lat: Optional[float], farm_lon: Optional[float]) -> dict:
    """Compare the report's GPS fix against the farmer's registered farm."""
    if report_lat is None or report_lon is None:
        return {"plausible": None, "distance_km": None,
                "note": "No GPS fix was captured with this report."}
    if farm_lat is None or farm_lon is None:
        return {"plausible": None, "distance_km": None,
                "note": "Your farm has no registered location yet, so the report's "
                       "location could not be cross-checked against it."}

    distance = haversine_km(report_lat, report_lon, farm_lat, farm_lon)
    plausible = distance <= LOCATION_PLAUSIBLE_RADIUS_KM
    note = (f"Location is {distance:.1f} km from your registered farm "
           f"({'within' if plausible else 'beyond'} the "
           f"{LOCATION_PLAUSIBLE_RADIUS_KM:.0f} km expected radius).")
    return {"plausible": plausible, "distance_km": round(distance, 1), "note": note}


def check_time(location_timestamp: Optional[datetime],
               server_now: Optional[datetime] = None) -> dict:
    """Was the GPS fix itself captured recently, not replayed from a stale
    cached position?"""
    if location_timestamp is None:
        return {"plausible": None,
                "note": "No GPS fix timestamp was provided to check."}
    server_now = server_now or datetime.utcnow()
    delta_minutes = abs((server_now - location_timestamp).total_seconds()) / 60
    plausible = delta_minutes <= TIME_PLAUSIBLE_WINDOW_MINUTES
    note = (f"Location was captured {delta_minutes:.1f} minute(s) before filing "
           f"({'within' if plausible else 'beyond'} the "
           f"{TIME_PLAUSIBLE_WINDOW_MINUTES}-minute freshness window).")
    return {"plausible": plausible, "delta_minutes": round(delta_minutes, 1), "note": note}


def match_channel(db: Session, disaster_type: str,
                  at: Optional[datetime] = None) -> Optional[ReliefChannel]:
    """The currently-active relief channel (if any) for this disaster type.

    Among channels active at `at` (default: now), prefers the one with the
    soonest closing date — the most time-sensitive, most specifically-formed
    response — over an open-ended general channel.
    """
    at = at or datetime.utcnow()
    candidates = (db.query(ReliefChannel)
                  .filter(ReliefChannel.disaster_type == disaster_type,
                          ReliefChannel.active_from <= at)
                  .filter((ReliefChannel.active_until.is_(None))
                          | (ReliefChannel.active_until >= at))
                  .all())
    if not candidates:
        return None
    # Soonest-closing first; open-ended (None) channels sort last.
    candidates.sort(key=lambda c: (c.active_until is None, c.active_until or at))
    return candidates[0]


def channel_out(channel: Optional[ReliefChannel]) -> Optional[dict]:
    if not channel:
        return None
    return {
        "id": channel.id,
        "name": channel.name,
        "disaster_type": channel.disaster_type,
        "description": channel.description,
        "region": channel.region,
        "provides_money": channel.provides_money,
        "amount_info": channel.amount_info,
        "contact": channel.contact,
        "active_until": channel.active_until.isoformat() if channel.active_until else None,
        "open_ended": channel.active_until is None,
    }
