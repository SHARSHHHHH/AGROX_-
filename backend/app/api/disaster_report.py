"""Farmer-submitted emergency reports — floods, pest attacks, water
shortage, fire, or other crop-threatening disasters — filed with a real
geolocation, a deterministically assessed severity, and a routed relief/
government channel.

Agentic shape, same as app/agents/agent.py: a fixed tool chain (save
evidence -> reverse geocode -> optionally re-use the existing pest/disease
vision pipeline on an attached photo -> deterministic severity scoring ->
channel routing) runs first and produces the actual decision. The response
carries `tools_called` / `data_used` for the same transparency reason the
chat agent does.

Endpoints:
  POST /api/disaster/report       multipart (type, description, gps, files) -> filed report
  GET  /api/disaster/my-reports   this user's own report history
"""
import os
import uuid
import aiofiles
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.core.security import get_current_user
from app.models.models import DisasterReport, Farm, User
from app.services import geocode as geocode_svc
from app.services import disaster_triage
from app.services import weather as weather_svc
from app.services import relief_channels as relief_svc
from app.services.pest_pipeline import run_pest_pipeline
from app.ml.vision import analyze_image

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

disaster_router = APIRouter(prefix="/api/disaster", tags=["disaster"])

DISASTER_TYPES = {"flood", "drought", "pest", "disease", "fire", "other"}

# Upload guardrails: emergency evidence is user-controlled input. Keep the
# endpoint useful on mobile connections without allowing an accidental or
# malicious multi-hundred-MB request to exhaust server memory/disk.
MAX_FILES = 5
MAX_FILE_BYTES = 25 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
}
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    ".mp4", ".webm", ".mov",
}
# A recorded-in-browser voice note is accepted as its own upload, separate
# from photo/video evidence, so it's stored distinctly (voice_note_path)
# rather than mixed into the media gallery.
ALLOWED_VOICE_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"}
ALLOWED_VOICE_EXTENSIONS = {".webm", ".ogg", ".m4a", ".mp3", ".wav"}
MAX_VOICE_BYTES = 15 * 1024 * 1024


@disaster_router.post("/report")
async def file_report(
    disaster_type: str = Form(...),
    description: str = Form(""),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_timestamp: Optional[float] = Form(None),  # ms since epoch, from the
                                                        # browser's Geolocation fix
    crop: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    voice_note: Optional[UploadFile] = File(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if disaster_type not in DISASTER_TYPES:
        raise HTTPException(400, f"Unknown disaster_type. Use one of: {sorted(DISASTER_TYPES)}")
    if not description.strip() and not files and not voice_note:
        raise HTTPException(400, "Add a description, a photo/video, a voice note, or any "
                                 "combination — an empty report can't be assessed or routed.")

    tools_called: list = []
    data_used: list = []

    # ---- Save media evidence (photo/video) ----
    if len(files) > MAX_FILES:
        raise HTTPException(413, f"Attach at most {MAX_FILES} photos/videos.")

    media_paths = []
    for f in files:
        content_type = (f.content_type or "").lower()
        ext = os.path.splitext(f.filename or "")[1].lower()
        if content_type not in ALLOWED_MEDIA_TYPES or ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(415, "Only common image/video files (JPG, PNG, WEBP, GIF, MP4, WEBM, MOV) are accepted.")

        path = os.path.join(UPLOAD_DIR, f"disaster_{uuid.uuid4().hex}{ext}")
        total = 0
        try:
            async with aiofiles.open(path, "wb") as out:
                while True:
                    chunk = await f.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_FILE_BYTES:
                        raise HTTPException(413, f"Each evidence file must be 25 MB or smaller.")
                    await out.write(chunk)
        except Exception:
            if os.path.exists(path):
                os.remove(path)
            raise
        media_paths.append(path)
    if media_paths:
        tools_called.append("save_evidence_media")
        data_used.append(f"{len(media_paths)} media file(s) attached as evidence")

    # ---- Save voice note, if provided ----
    voice_note_path = None
    if voice_note is not None:
        content_type = (voice_note.content_type or "").lower()
        ext = os.path.splitext(voice_note.filename or "")[1].lower()
        if content_type not in ALLOWED_VOICE_TYPES and ext not in ALLOWED_VOICE_EXTENSIONS:
            raise HTTPException(415, "Voice note must be a common audio format "
                                     "(webm, ogg, m4a, mp3, wav).")
        path = os.path.join(UPLOAD_DIR, f"disaster_voice_{uuid.uuid4().hex}{ext or '.webm'}")
        total = 0
        try:
            async with aiofiles.open(path, "wb") as out:
                while True:
                    chunk = await voice_note.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_VOICE_BYTES:
                        raise HTTPException(413, "Voice note must be 15 MB or smaller.")
                    await out.write(chunk)
        except Exception:
            if os.path.exists(path):
                os.remove(path)
            raise
        voice_note_path = path
        tools_called.append("save_voice_note")
        data_used.append("Voice note attached as evidence.")

    # ---- Farm profile fallback (crop, prior known location) ----
    farm = db.query(Farm).filter(Farm.user_id == user.id).first()
    lat = latitude if latitude is not None else (farm.latitude if farm else None)
    lon = longitude if longitude is not None else (farm.longitude if farm else None)
    state = user.state or (farm.state if farm else "")
    district = user.district or (farm.district if farm else "")

    # ---- Reverse geocode the GPS fix, if we have one ----
    if lat is not None and lon is not None:
        tools_called.append("reverse_geocode")
        geo = await geocode_svc.reverse_geocode(lat, lon)
        if geo.get("status") == "ok":
            state = geo.get("state") or state
            district = geo.get("district") or district
            data_used.append(f"Location resolved to {district or '—'}, {state or '—'} "
                             f"from GPS ({lat:.4f}, {lon:.4f}).")
        else:
            data_used.append("GPS provided but could not be resolved to a state/district; "
                             "using the farm profile's location instead.")
    else:
        data_used.append("No GPS fix from the browser — using the farm profile's location.")

    # ---- Re-use the existing vision pipelines for pest/disease photos ----
    # Same models already used on the Plant Health / Pest Management pages —
    # not a new model, just feeding one more consumer with the same tool.
    vision_hint = None
    if media_paths and disaster_type in ("pest", "disease"):
        try:
            if disaster_type == "pest":
                try:
                    wx = await weather_svc.get_weather()
                    environment = {"temperature": wx.get("temperature"),
                                   "humidity": wx.get("humidity"),
                                   "rain_probability": wx.get("rain_probability")}
                except Exception:
                    environment = None
                res = await run_pest_pipeline(
                    media_paths[0], crop or (farm.crop if farm else ""),
                    farm.growth_stage if farm else "", environment)
                tools_called.append("run_pest_pipeline")
                sev = (res.get("severity") or {}).get("level")
                label = (res.get("pest") or {}).get("name") or res.get("type")
                if sev:
                    vision_hint = {"severity": sev, "label": label}
                    data_used.append(f"Photo pest analysis: {label} (severity {sev}).")
            else:
                res = await analyze_image(media_paths[0], crop or (farm.crop if farm else ""))
                tools_called.append("analyze_image")
                if res.get("severity"):
                    vision_hint = {"severity": res["severity"], "label": res.get("disease")}
                    data_used.append(f"Photo disease analysis: {res.get('disease')} "
                                     f"(severity {res['severity']}).")
        except Exception:
            # A vision hiccup should never block filing an emergency report.
            data_used.append("Photo analysis did not complete — severity was assessed "
                             "from the disaster type and description alone.")

    # ---- Deterministic severity + routing (see disaster_triage.py) ----
    severity = disaster_triage.assess(disaster_type, description, vision_hint)
    tools_called.append("assess_severity")
    routing = disaster_triage.route(severity["level"], state, district)
    tools_called.append("route_to_channel")

    # ---- Plausibility checks: location vs registered farm, GPS freshness ----
    loc_check = relief_svc.check_location(
        lat, lon, farm.latitude if farm else None, farm.longitude if farm else None)
    tools_called.append("check_location_plausibility")
    data_used.append(loc_check["note"])

    loc_ts_dt = (datetime.utcfromtimestamp(location_timestamp / 1000)
                 if location_timestamp else None)
    time_check = relief_svc.check_time(loc_ts_dt)
    tools_called.append("check_time_plausibility")
    data_used.append(time_check["note"])

    verification_notes = " ".join([loc_check["note"], time_check["note"]])

    # ---- Match this report to a currently-active relief channel ----
    matched_channel = relief_svc.match_channel(db, disaster_type)
    tools_called.append("match_relief_channel")
    if matched_channel:
        data_used.append(f"Matched to active relief channel: {matched_channel.name}.")
    else:
        data_used.append("No relief channel is currently active for this disaster "
                         "type — report is still filed and routed for review.")

    reference_no = f"DR-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    report = DisasterReport(
        user_id=user.id, reference_no=reference_no, disaster_type=disaster_type,
        crop=crop or (farm.crop if farm else ""), description=description,
        latitude=lat, longitude=lon, state=state, district=district,
        severity=severity["level"], severity_reason=severity["reason"],
        media_paths=media_paths, voice_note_path=voice_note_path,
        filed_to=routing["label"], status="filed",
        location_timestamp=loc_ts_dt,
        location_plausible=loc_check["plausible"],
        location_distance_km=loc_check.get("distance_km"),
        time_plausible=time_check["plausible"],
        verification_notes=verification_notes,
        matched_channel_id=matched_channel.id if matched_channel else None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "reference_no": reference_no,
        "disaster_type": disaster_type,
        "severity": severity["level"],
        "severity_reason": severity["reason"],
        "filed_to": routing["label"],
        "status": "filed",
        "state": state,
        "district": district,
        "created_at": report.created_at.isoformat(),
        "tools_called": tools_called,
        "data_used": data_used,
        "verification": {
            "location": loc_check,
            "time": time_check,
        },
        "relief_channel": relief_svc.channel_out(matched_channel),
    }


@disaster_router.get("/my-reports")
def my_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(DisasterReport).filter(DisasterReport.user_id == user.id)
            .order_by(DisasterReport.created_at.desc()).limit(20).all())
    return [{
        "id": r.id, "reference_no": r.reference_no, "disaster_type": r.disaster_type,
        "crop": r.crop, "severity": r.severity, "filed_to": r.filed_to,
        "status": r.status, "state": r.state, "district": r.district,
        "created_at": r.created_at.isoformat(),
        "relief_channel": relief_svc.channel_out(r.matched_channel),
    } for r in rows]


@disaster_router.get("/relief-channels")
def list_relief_channels(disaster_type: Optional[str] = None,
                         db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    """All relief channels, so a farmer can see what's currently available
    even before filing a report — not just after."""
    from app.models.models import ReliefChannel
    q = db.query(ReliefChannel)
    if disaster_type:
        q = q.filter(ReliefChannel.disaster_type == disaster_type)
    rows = q.order_by(ReliefChannel.disaster_type, ReliefChannel.active_from.desc()).all()
    now = datetime.utcnow()
    out = []
    for c in rows:
        is_active = c.active_from <= now and (c.active_until is None or c.active_until >= now)
        item = relief_svc.channel_out(c)
        item["is_active"] = is_active
        out.append(item)
    return out
