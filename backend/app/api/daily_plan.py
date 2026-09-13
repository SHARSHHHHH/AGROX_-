"""Daily Plan API endpoints.

GET  /api/daily-plan/today     — today's plan (generate if missing)
POST /api/daily-plan/refresh   — force regenerate and store
GET  /api/daily-plan/history   — last N days of stored plans
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.models import DailyPlan, Farm, User
from app.core.security import get_current_user
from app.services.daily_planner import generate_daily_plan, _today_str

router = APIRouter(prefix="/api/daily-plan", tags=["daily-plan"])


def _lang(language: str = Query("", pattern="^(en|ta|hi)?$")) -> str:
    """Language currently selected in the app UI.

    It overrides the language the farmer chose at signup so the overview
    always matches what the page is showing (e.g. an English UI must get an
    English summary even if the farmer registered in Tamil).
    """
    return (language or "").strip().lower()


def _farm(db: Session, user: User):
    return db.query(Farm).filter(Farm.user_id == user.id).first()


@router.get("/today")
async def today(language: str = Depends(_lang),
                user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Return today's plan. If it does not exist yet, generate it on demand."""
    today_str = _today_str()
    farm = _farm(db, user)
    existing = (db.query(DailyPlan)
                .filter(DailyPlan.user_id == user.id,
                        DailyPlan.plan_date == today_str)
                .first())
    if existing and (not language or existing.language == language):
        # A stored plan in the right language is returned instantly. If the
        # farmer has since switched the UI language, fall through and
        # regenerate so the overview always reads in the selected language.
        return {"tasks": existing.tasks, "summary": existing.summary,
                "data_sources": existing.data_sources,
                "generated_at": existing.created_at.isoformat(),
                "status": existing.status, "source": "stored"}

    if not farm:
        return {"tasks": {}, "summary": "Please complete your farm setup first.",
                "data_sources": [], "status": "no_farm", "source": "none"}

    plan = await generate_daily_plan(db, user, farm, language)
    if existing:
        existing.tasks = plan["tasks"]
        existing.summary = plan["summary"]
        existing.data_sources = plan["data_sources"]
        existing.language = language or getattr(user, "language", "") or "en"
        existing.status = "generated"
    else:
        db.add(DailyPlan(
            user_id=user.id, farm_id=farm.id,
            plan_date=today_str,
            tasks=plan["tasks"], summary=plan["summary"],
            data_sources=plan["data_sources"],
            language=language or getattr(user, "language", "") or "en"))
    db.commit()
    return {"tasks": plan["tasks"], "summary": plan["summary"],
            "data_sources": plan["data_sources"],
            "status": "generated", "source": "on_demand"}


@router.post("/refresh")
async def refresh(language: str = Depends(_lang),
                  user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """Force-regenerate today's plan and overwrite any existing one."""
    farm = _farm(db, user)
    if not farm:
        return {"tasks": {}, "summary": "Please complete your farm setup first.",
                "data_sources": [], "status": "no_farm"}

    plan = await generate_daily_plan(db, user, farm, language)
    lang = language or getattr(user, "language", "") or "en"
    today_str = _today_str()
    existing = (db.query(DailyPlan)
                .filter(DailyPlan.user_id == user.id,
                        DailyPlan.plan_date == today_str)
                .first())
    if existing:
        existing.tasks = plan["tasks"]
        existing.summary = plan["summary"]
        existing.data_sources = plan["data_sources"]
        existing.language = lang
        existing.status = "generated"
    else:
        db.add(DailyPlan(
            user_id=user.id, farm_id=farm.id,
            plan_date=today_str,
            tasks=plan["tasks"], summary=plan["summary"],
            data_sources=plan["data_sources"], language=lang))
    db.commit()
    return {"tasks": plan["tasks"], "summary": plan["summary"],
            "data_sources": plan["data_sources"],
            "status": "generated", "source": "refresh"}


@router.get("/history")
def history(days: int = 7, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    """Return stored plans for the last N days (most recent first)."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    rows = (db.query(DailyPlan)
            .filter(DailyPlan.user_id == user.id,
                    DailyPlan.plan_date >= cutoff)
            .order_by(DailyPlan.plan_date.desc())
            .all())
    return [{"date": r.plan_date, "tasks": r.tasks, "summary": r.summary,
             "data_sources": r.data_sources, "language": r.language,
             "status": r.status}
            for r in rows]