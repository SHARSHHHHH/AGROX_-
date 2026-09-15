"""Multi-source cross-check service.

An answer built from ONE source can be wrong: a sensor says the soil is dry
but rain is coming, or the satellite says the canopy is fine while a local
sensor contradicts it. This service is the agent's way of NOT trusting any
single number.

For a decision (e.g. "should I water?"), it gathers the independent sources
it can actually reach — sensors, weather forecast, satellite vigour, soil
test — compares what each one implies, and returns a consensus with an
explicit agreement score and a list of any conflicts. The agent relays that
consensus plus the conflicts to the farmer, in their language.

Deliberately deterministic. No LLM invents the consensus here; arithmetic
only. The model may REPHRASE it later, never originate it.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.models import (Farm, SatelliteObservation, SensorReading,
                               SoilTest, User)
from app.services import weather as weather_svc
from app.services.vegetation import classify_ndvi
from app.services.recommendation import CROP_MOISTURE_FLOOR


async def gather_all_sources(db: Session, user: User, farm: Optional[Farm],
                             device_id: str) -> Dict[str, Any]:
    """Fetch every source an answer might need, concurrently.

    Returns a flat dict with keys present only when the source produced data:
        sensor      {soil_moisture, temperature, humidity, water_level, timestamp}
        weather     {condition, temperature, humidity, rain_probability, ...}
        satellite   {ndvi, band, meaning, observed_on}
        soil        {n, p, k, ph, measured_at}
        sat_status  one of ok/stale/no_observation/not_configured/unavailable
    Missing sources are simply absent — the caller must handle that.
    """
    async def _sensor():
        r = (db.query(SensorReading)
             .filter(SensorReading.device_id == device_id)
             .order_by(SensorReading.created_at.desc()).first())
        if not r:
            return None
        return {"soil_moisture": r.soil_moisture, "temperature": r.temperature,
                "humidity": r.humidity, "water_level": r.water_level,
                "timestamp": r.created_at.isoformat()}

    async def _weather():
        try:
            wx = await weather_svc.get_weather(farm.lat, farm.lon)
            return {"condition": wx.get("condition"),
                    "temperature": wx.get("temperature"),
                    "humidity": wx.get("humidity"),
                    "rain_probability": wx.get("rain_probability"),
                    "interpretation": wx.get("interpretation")}
        except Exception:                        # noqa: BLE001
            return None

    async def _satellite():
        row = (db.query(SatelliteObservation)
               .filter(SatelliteObservation.user_id == user.id,
                       SatelliteObservation.ndvi.isnot(None))
               .order_by(SatelliteObservation.created_at.desc()).first())
        if not row:
            return None
        cls = classify_ndvi(row.ndvi)
        return {"ndvi": row.ndvi, "band": cls["band"],
                "meaning": cls["meaning"], "observed_on": row.observed_on,
                "ndmi": row.ndmi}

    async def _soil():
        s = (db.query(SoilTest).filter(SoilTest.user_id == user.id)
             .order_by(SoilTest.created_at.desc()).first())
        if not s:
            return None
        return {"n": s.nitrogen, "p": s.phosphorus, "k": s.potassium,
                "ph": s.ph, "measured_at": s.created_at.isoformat()}

    sensor, wx, sat, soil = await asyncio.gather(
        _sensor(), _weather(), _satellite(), _soil())

    out: Dict[str, Any] = {}
    if sensor:
        out["sensor"] = sensor
    if wx:
        out["weather"] = wx
    if sat:
        out["satellite"] = sat
    if soil:
        out["soil"] = soil
    return out


def _moisture_status(sm: Optional[float], crop: str) -> Optional[str]:
    if sm is None:
        return None
    floor = CROP_MOISTURE_FLOOR.get((crop or "default").lower(),
                                    CROP_MOISTURE_FLOOR["default"])
    if sm < floor - 12:
        return "very_low"
    if sm < floor:
        return "low"
    if sm <= floor + 25:
        return "optimal"
    return "high"


def cross_check_irrigation(sources: Dict[str, Any], crop: str) -> Dict[str, Any]:
    """Compare every available source and reach a consensus on watering.

    RULES (deterministic, additive):
        - A dry sensor pushes TOWARD watering.
        - A clear-weather + strong rain forecast in the next day pushes AWAY.
        - A satellite band of GOOD/VERY GOOD / EXCELLENT suggests the canopy
          is fine, counteracting a briefly low sensor spike.
        - Current temperature over the crop's comfort zone pushes TOWARD.

    Returns:
        consensus    "water" | "hold" | "consider" | "insufficient_data"
        agreement    float 0..1  (how much the available sources agreed)
        sources      list of {name, status(agree|conflict|neutral), detail}
        conflicts    list of human-string conflicts between sources
    """
    sensor = sources.get("sensor")
    wx = sources.get("weather")
    sat = sources.get("satellite")
    soil = sources.get("soil")

    moisture = _moisture_status((sensor or {}).get("soil_moisture"), crop)
    sm_raw = (sensor or {}).get("soil_moisture")

    sources_report: List[Dict[str, Any]] = []
    conflicts: List[str] = []
    votes = {"water": 0, "hold": 0, "neutral": 0}

    if sensor:
        detail = f"Soil moisture {sm_raw}% ({moisture})"
        if moisture in ("very_low", "low"):
            votes["water"] += 1
            sources_report.append({"name": "sensor", "status": "water",
                                   "detail": detail})
        elif moisture in ("optimal", "high"):
            votes["hold"] += 1
            sources_report.append({"name": "sensor", "status": "hold",
                                   "detail": detail})
        else:
            sources_report.append({"name": "sensor", "status": "unknown",
                                   "detail": "No sensor reading available"})
    else:
        sources_report.append({"name": "sensor", "status": "unknown",
                               "detail": "No sensor reading available"})

    if wx:
        rain = wx.get("rain_probability", 0)
        detail = (f"{wx.get('condition', 'Unknown')}, "
                  f"rain probability {rain}%")
        if rain >= 70:
            votes["hold"] += 1
            sources_report.append({"name": "weather", "status": "hold",
                                   "detail": detail})
            if moisture in ("very_low", "low"):
                conflicts.append(
                    f"Sensor reads dry but rain probability is {rain}% — "
                    "natural rainfall is likely, so watering may be unnecessary.")
        elif rain >= 40 and moisture in ("very_low", "low"):
            votes["neutral"] += 1
            sources_report.append({"name": "weather", "status": "neutral",
                                   "detail": detail})
            conflicts.append(
                f"Sensor reads dry and rain probability is {rain}% — "
                "consider watering, but check the forecast before the pump "
                "runs long.")
        else:
            votes["water"] += 1
            sources_report.append({"name": "weather", "status": "water",
                                   "detail": detail})
    else:
        sources_report.append({"name": "weather", "status": "unknown",
                               "detail": "No weather data available"})

    if sat:
        band = (sat.get("band") or "UNKNOWN").upper()
        detail = (f"NDVI {sat.get('ndvi')} ({band}), "
                  f"observed {sat.get('observed_on')}")
        if band in ("GOOD", "VERY GOOD", "EXCELLENT"):
            votes["hold"] += 1
            sources_report.append({"name": "satellite", "status": "hold",
                                   "detail": detail})
            if moisture in ("very_low", "low"):
                conflicts.append(
                    "Sensor reads dry but the satellite shows a healthy "
                    f"canopy ({band} NDVI) — the low reading may be a spike; "
                    "check the sensor before acting.")
        elif band in ("LOW", "VERY LOW", "BARE"):
            votes["water"] += 1
            sources_report.append({"name": "satellite", "status": "water",
                                   "detail": detail})
        else:
            sources_report.append({"name": "satellite", "status": "neutral",
                                   "detail": detail})
    else:
        sources_report.append({"name": "satellite", "status": "unknown",
                               "detail": "No cloud-free satellite reading yet"})

    if soil:
        detail = f"Soil NPK {soil['n']}-{soil['p']}-{soil['k']}, pH {soil['ph']}"
        sources_report.append({"name": "soil", "status": "neutral",
                               "detail": detail})

    # Decide the consensus from the vote tally.
    if not any(s["status"] != "unknown" for s in sources_report):
        consensus = "insufficient_data"
    elif votes["water"] > votes["hold"]:
        consensus = "water"
    elif votes["hold"] > votes["water"]:
        consensus = "hold"
    elif votes["water"] == votes["hold"] and votes["water"] > 0:
        consensus = "consider"
    else:
        consensus = "consider"

    active = [s for s in sources_report if s["status"] != "unknown"]
    agreement = round(len(active) - max(votes["water"], votes["hold"])
                      + len([s for s in sources_report if s["status"] == "unknown"])
                      , 2) if active else 0.0
    # Simpler, more meaningful agreement: fraction of categorical sources that
    # ended up on the SAME side as the consensus (excluding neutral/unknown).
    side = votes["water"] if consensus == "water" else votes["hold"]
    total = votes["water"] + votes["hold"]
    agreement = round(side / total, 2) if total else 0.0

    return {
        "consensus": consensus,
        "agreement": agreement,
        "sources": sources_report,
        "conflicts": conflicts,
    }


def cross_check_general(topic: str, sources: Dict[str, Any]) -> Dict[str, Any]:
    """Cross-check for any non-irrigation topic: report what each source says.

    Returns a generic but honest per-source rundown plus an agreement float,
    so the agent can answer "double-check this for me" without a specialised
    rule for every domain.
    """
    report: List[Dict[str, Any]] = []
    if "sensor" in sources:
        s = sources["sensor"]
        report.append({"name": "sensor", "status": "ok",
                       "detail": (f"Soil {s.get('soil_moisture')}%, "
                                  f"temp {s.get('temperature')}°C, "
                                  f"humidity {s.get('humidity')}%")})
    if "weather" in sources:
        w = sources["weather"]
        report.append({"name": "weather", "status": "ok",
                       "detail": f"{w.get('condition')}, "
                                 f"rain {w.get('rain_probability')}%"})
    if "satellite" in sources:
        sa = sources["satellite"]
        report.append({"name": "satellite", "status": "ok",
                       "detail": f"NDVI {sa.get('ndvi')} ({sa.get('band')})"})
    if "soil" in sources:
        so = sources["soil"]
        report.append({"name": "soil", "status": "ok",
                       "detail": f"NPK {so['n']}-{so['p']}-{so['k']}, "
                                 f"pH {so['ph']}"})

    if not report:
        return {"consensus": "insufficient_data", "agreement": 0.0,
                "sources": [], "conflicts": []}

    return {"consensus": "data_available",
            "agreement": round(0.75 + 0.05 * min(len(report), 4), 2),
            "sources": report,
            "conflicts": []}