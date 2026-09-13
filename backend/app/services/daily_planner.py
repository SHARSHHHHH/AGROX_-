"""Farm Daily Planner — morning task generation from live data.

Gathers every data source the platform has — sensors, weather, satellite,
soil, market prices, lifecycle stage, biogas — and builds a structured
day plan as JSON, then asks the LLM to produce a natural-language summary
in the farmer's own language. The whole output is stored in DailyPlan so
the frontend can render it instantly on load.

Designed to be called both:
  * by the background scheduler at ~5 AM IST (all farmers, in bulk), and
  * by the POST /api/daily-plan/refresh endpoint (single farmer, on-demand).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.models import Farm, SensorReading, SoilTest, User
from app.services import weather as weather_svc
from app.services import market as market_svc
from app.services.lifecycle import LIFECYCLE
from app.ai.llm import chat as llm_chat

log = logging.getLogger("agri.daily_planner")


# ── stage-keyed task templates ─────────────────────────────────────────
# Each lifecycle stage has a set of generic morning tasks that apply
# regardless of crop. The planner augments these with crop-specific data
# from the lifecycle KB.

_MORNING_GENERIC = [
    {"time": "06:00", "task": "Walk the field — look for wilting, insect damage, or new growth",
     "priority": "medium", "source": "general"},
    {"time": "06:30", "task": "Check the soil moisture sensor reading and compare with yesterday",
     "priority": "high", "source": "sensor"},
]

_AFTERNOON_GENERIC = [
    {"time": "12:00", "task": "Record any visible leaf discolouration or pest activity",
     "priority": "medium", "source": "general"},
]

_EVENING_GENERIC = [
    {"time": "17:00", "task": "Log today's activities and any anomalies",
     "priority": "low", "source": "general"},
    {"time": "17:30", "task": "Check tomorrow's weather forecast for overnight planning",
     "priority": "medium", "source": "weather"},
]


def _today_str() -> str:
    return date.today().isoformat()


def _days_since_sowing(farm: Farm) -> Optional[int]:
    if not farm or not getattr(farm, "sowing_date", None):
        return None
    try:
        sowing = datetime.strptime(farm.sowing_date, "%Y-%m-%d").date()
        return (date.today() - sowing).days
    except (ValueError, TypeError):
        return None


def _current_stage(crop: str, days: Optional[int]) -> Optional[dict]:
    """Return the lifecycle stage dict the farm is currently in, if known."""
    if crop is None or days is None:
        return None
    stages = LIFECYCLE.get(crop.lower(), [])
    for s in stages:
        if s["start_day"] <= days <= s["end_day"]:
            return s
    return None


def _build_tasks(sensor: Optional[dict], wx: Optional[dict],
                 soil: Optional[dict], market: Optional[dict],
                 lifecycle_stage: Optional[dict],
                 crop: str) -> Dict[str, list]:
    """Deterministic task builder. No LLM here — arithmetic and templates only."""
    morning: list = []
    afternoon: list = list(_AFTERNOON_GENERIC)
    evening: list = list(_EVENING_GENERIC)

    sm = (sensor or {}).get("soil_moisture")
    temp = (sensor or {}).get("temperature") or (wx or {}).get("temperature")
    rain = (wx or {}).get("rain_probability", 0)

    # ── Irrigation task ──
    if sm is not None:
        from app.services.recommendation import recommend_irrigation
        rec = recommend_irrigation(sm, sensor.get("temperature", 25),
                                   sensor.get("humidity", 50),
                                   rain, crop)
        if rec["irrigate"]:
            morning.insert(0, {
                "time": "06:15",
                "task": f"Irrigate your {crop} field for {rec['duration_min']} min",
                "priority": rec["priority"].lower(),
                "source": "sensor+weather",
                "detail": rec["reason"],
            })
        else:
            morning.insert(0, {
                "time": "06:15",
                "task": f"No irrigation needed for {crop} today",
                "priority": "low",
                "source": "sensor+weather",
                "detail": rec["reason"],
            })
    elif wx:
        morning.insert(0, {
            "time": "06:15",
            "task": "Check soil moisture before deciding on irrigation",
            "priority": "medium",
            "source": "weather",
            "detail": f"Rain probability {rain}%, temp {temp}°C — "
                      "use manual check or sensor data to decide.",
        })

    # ── Weather-based tasks ──
    if rain >= 60:
        morning.append({
            "time": "06:45",
            "task": "Cover sensitive seedlings / ensure drainage channels are clear — strong rain expected",
            "priority": "high",
            "source": "weather",
            "detail": f"Rain probability {rain}%",
        })
    if temp and temp >= 38:
        afternoon.append({
            "time": "13:00",
            "task": "Check for heat stress — wilting, leaf curl, flower drop",
            "priority": "high",
            "source": "weather",
            "detail": f"Temperature {temp}°C — above heat-stress threshold",
        })

    # ── Soil-based tasks ──
    if soil:
        n = soil.get("n", 0)
        if n < 50:
            morning.append({
                "time": "07:00",
                "task": "Consider nitrogen top-dressing — soil N is low",
                "priority": "medium",
                "source": "soil",
                "detail": f"Nitrogen level {n}",
            })
        ph = soil.get("ph", 7)
        if ph < 5.5 or ph > 7.5:
            morning.append({
                "time": "07:15",
                "task": "Soil pH is outside ideal range — test before applying lime/sulphur",
                "priority": "low",
                "source": "soil",
                "detail": f"pH {ph}",
            })

    # ── Lifecycle tasks ──
    if lifecycle_stage:
        for t in lifecycle_stage.get("tasks", [])[:2]:
            morning.append({
                "time": "07:30",
                "task": t,
                "priority": "medium",
                "source": "lifecycle",
            })
        if lifecycle_stage.get("irrigation"):
            afternoon.append({
                "time": "14:00",
                "task": f"Lifecycle irrigation note: {lifecycle_stage['irrigation']}",
                "priority": "medium",
                "source": "lifecycle",
            })

    # ── Market task ──
    if market and market.get("status") == "ok" and market.get("prices"):
        prices = market["prices"]
        morning.append({
            "time": "07:45",
            "task": f"Check mandi price for {crop}: modal ₹{prices.get('modal', 'N/A')}/quintal",
            "priority": "low",
            "source": "market",
        })

    # ── Evening planning ──
    evening.insert(0, {
        "time": "17:00",
        "task": f"Record today's observations for {crop} in the app",
        "priority": "medium",
        "source": "general",
    })

    return {"morning": morning, "afternoon": afternoon, "evening": evening}


async def generate_daily_plan(db: Session, user: User,
                              farm: Optional[Farm],
                              ui_language: str = "") -> Dict[str, Any]:
    """Gather all data, build task JSON, generate LLM summary.

    `ui_language` is the language the farmer currently has selected in the
    app UI (en/ta/hi). It takes priority over the language stored at signup,
    so a Tamil-registered farmer who switches the page to English gets an
    English summary. Falls back to the stored user language when the client
    does not send one.

    Returns the full plan dict ready to store in DailyPlan.tasks.
    """
    device_id = farm.device_id if farm and farm.device_id else "ESP32-001"
    crop = farm.crop if farm else ""

    lat = getattr(farm, "lat", None)
    lon = getattr(farm, "lon", None)
    farm_lat = lat if lat else 13.08
    farm_lon = lon if lon else 80.27

    async def _sensor():
        r = (db.query(SensorReading)
             .filter(SensorReading.device_id == device_id)
             .order_by(SensorReading.created_at.desc()).first())
        if not r:
            return None
        return {"soil_moisture": r.soil_moisture, "temperature": r.temperature,
                "humidity": r.humidity, "water_level": r.water_level}

    async def _weather():
        try:
            return await weather_svc.get_weather(farm_lat, farm_lon)
        except Exception:
            return None

    async def _market():
        try:
            return await market_svc.get_price(crop, user.state or "")
        except Exception:
            return None

    async def _soil():
        s = (db.query(SoilTest).filter(SoilTest.user_id == user.id)
             .order_by(SoilTest.created_at.desc()).first())
        if not s:
            return None
        return {"n": s.nitrogen, "p": s.phosphorus,
                "k": s.potassium, "ph": s.ph}

    sensor, wx, market_data, soil = await asyncio.gather(
        _sensor(), _weather(), _market(), _soil())

    days = _days_since_sowing(farm)
    stage = _current_stage(crop, days)

    tasks = _build_tasks(sensor, wx, soil, market_data, stage, crop)

    data_sources = []
    if sensor:
        data_sources.append("sensor")
    if wx:
        data_sources.append("weather")
    if market_data and market_data.get("status") == "ok":
        data_sources.append("market")
    if soil:
        data_sources.append("soil")
    if stage:
        data_sources.append("lifecycle")

    # LLM summary — grounded entirely in the tasks above.
    task_text = "\n".join(
        f"[{period}] " + "; ".join(t["task"] for t in tlist)
        for period, tlist in tasks.items()
        if tlist
    )
    if not task_text.strip():
        task_text = f"No specific tasks identified today for {crop}. Monitor the field and check the app for updates."

    # UI language the farmer is seeing takes priority over the language they
    # chose at signup — a farmer who switched the page to English expects an
    # English overview even if they originally registered in Tamil.
    lang = ui_language or getattr(user, "language", "") or "en"
    lang_name = {"hi": "Hindi", "ta": "Tamil", "en": "English"}.get(lang, "English")
    script = {"hi": "Devanagari", "ta": "Tamil"}.get(lang, "")

    system = (
        "You are a farm planner. Write today's summary for this farmer as one "
        "complete, flowing paragraph that covers the WHOLE day: name the "
        "top priorities, the irrigation/watering decision, any weather "
        "warning, any soil note, any market note, and end with one "
        "encouraging line. Do NOT cut the paragraph short and do NOT invent "
        "data. Write your ENTIRE reply in "
        f"{lang_name}"
        + (f" ({script} script)" if script else "")
        + " only — do not mix or switch languages. Keep crop names in English."
    )
    user_msg = (
        f"Today's date: {_today_str()}\n"
        f"Crop: {crop}\n"
        f"Growth stage: {stage['stage'] if stage else 'not set'}\n"
        f"Days since sowing: {days if days is not None else 'not set'}\n"
        f"Sources: {', '.join(data_sources) or 'none'}\n\n"
        f"Tasks:\n{task_text}"
    )

    try:
        # 1024 tokens (not the default 350) so the overview is NEVER cut
        # off mid-sentence — a complete answer beats a fast truncated one.
        summary = await llm_chat(system, user_msg, temperature=0.4,
                                 max_output_tokens=1024)
    except Exception as exc:
        log.warning("Daily planner LLM failed (%s); using plain summary", exc)
        summary = (
            f"Today's plan for {crop}: " +
            "; ".join(
                t["task"] for period, tlist in tasks.items()
                for t in tlist[:1]
            )
        )

    return {"tasks": tasks, "summary": summary, "data_sources": data_sources}


async def bulk_generate_all(db: Session) -> int:
    """Generate plans for ALL onboarded farmers. Called by the scheduler."""
    farms = db.query(Farm).filter(Farm.onboarded == True).all()
    count = 0
    for farm in farms:
        user = db.query(User).filter(User.id == farm.user_id).first()
        if not user:
            continue
        try:
            plan = await generate_daily_plan(db, user, farm)
            lang = getattr(user, "language", "") or "en"
            today = _today_str()
            from app.models.models import DailyPlan as DP
            existing = (db.query(DP).filter(DP.user_id == user.id,
                                            DP.plan_date == today).first())
            if existing:
                existing.tasks = plan["tasks"]
                existing.summary = plan["summary"]
                existing.data_sources = plan["data_sources"]
                existing.language = lang
                existing.status = "generated"
            else:
                db.add(DP(
                    user_id=user.id, farm_id=farm.id,
                    plan_date=today,
                    tasks=plan["tasks"], summary=plan["summary"],
                    data_sources=plan["data_sources"], language=lang))
            count += 1
        except Exception as exc:
            log.warning("Failed to generate plan for user %s: %s", user.id, exc)
    db.commit()
    return count