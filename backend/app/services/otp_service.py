"""Phone OTP service for farmer registration/login.

Flow: request_otp() -> _deliver_otp() (SMS or log) -> verify_otp().

Security notes:
  - The OTP code is NEVER returned in any API response. It is only ever
    handed to the (server-side) delivery function. In dev/demo mode that
    delivery function logs to the backend's own console — a real SMS
    provider key would live in Settings.SMS_API_KEY (server env only) and
    never reach the frontend or the compiled APK.
  - Only a salted hash of the code is stored, exactly like a password.
  - Codes expire, and verification is rate-limited per phone (OTP_MAX_ATTEMPTS)
    so a stolen/leaked OTP row can't be brute-forced.
"""
from __future__ import annotations

import logging
import random
import re
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password, jwt, JWTError
from app.models.models import PhoneOTP, User

log = logging.getLogger("agri.otp")

PHONE_RE = re.compile(r"^[6-9]\d{9}$")   # Indian mobile numbers, 10 digits


class OTPError(Exception):
    def __init__(self, message: str, code: str = "otp_error"):
        super().__init__(message)
        self.code = code


def normalise_phone(raw: str) -> str:
    """Strip spaces/+91/leading 0, return a bare 10-digit number, or ''
    if it doesn't look like a valid Indian mobile number."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits if PHONE_RE.match(digits) else ""


def _deliver_otp(phone: str, code: str) -> str:
    """Send the OTP to the farmer. Swappable per Settings.SMS_PROVIDER.

    Returns the actual delivery method used ('sms_gate', 'log').
    """
    if settings.SMS_PROVIDER == "sms_gate":
        return _deliver_via_sms_gate(phone, code)
    elif settings.SMS_PROVIDER == "log":
        log.info("[OTP] SMS to +91%s: your AGROX verification code is %s "
                 "(valid %d min)", phone, code, settings.OTP_EXPIRE_MINUTES)
        return "log"
    else:
        log.warning("[OTP] SMS_PROVIDER=%s is not implemented; falling back "
                    "to logging the code instead of sending it.", settings.SMS_PROVIDER)
        log.info("[OTP] SMS to +91%s: code %s", phone, code)
        return "log"


def _deliver_via_sms_gate(phone: str, code: str) -> str:
    """Send OTP via sms-gate.app REST API using Basic Auth.

    The gateway relies on a physical Android phone. If the phone is offline
    (screen locked, app killed, no network) messages sit in 'Pending'
    forever. This function checks the device health first and falls back to
    log-delivery when the phone is unreachable.
    """
    base_url = settings.SMS_GATE_URL.rsplit("/message", 1)[0]
    auth = (settings.SMS_GATE_USERNAME, settings.SMS_GATE_PASSWORD)

    # ── 1. Device health check ─────────────────────────────────────────
    try:
        dev_resp = httpx.get(f"{base_url}/device", auth=auth, timeout=8.0)
        dev_resp.raise_for_status()
        devices = dev_resp.json()
        if not devices:
            log.warning("[OTP] sms-gate: no devices registered — falling back to log")
            _log_otp_fallback(phone, code)
            return "log"

        from datetime import datetime, timezone
        last_seen_str = devices[0].get("lastSeen", "")
        # Parse ISO timestamp (may have timezone offset)
        try:
            last_seen = datetime.fromisoformat(last_seen_str)
            now = datetime.now(timezone.utc)
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
            offline_seconds = (now - last_seen).total_seconds()
            if offline_seconds > 120:
                log.warning("[OTP] sms-gate device offline for %ds — falling back to log",
                            int(offline_seconds))
                _log_otp_fallback(phone, code)
                return "log"
            log.info("[OTP] sms-gate device online (last seen %ds ago)", int(offline_seconds))
        except (ValueError, TypeError) as parse_err:
            log.warning("[OTP] sms-gate: could not parse lastSeen=%r — sending anyway",
                        last_seen_str)
    except Exception as exc:
        log.warning("[OTP] sms-gate device check failed: %s — sending anyway", exc)

    # ── 2. Send the SMS ────────────────────────────────────────────────
    e164_phone = f"+91{phone}"
    message = (
        f"Your AGROX verification code is {code}. "
        f"Valid for {settings.OTP_EXPIRE_MINUTES} minutes. Do not share this code."
    )
    try:
        resp = httpx.post(
            settings.SMS_GATE_URL,
            auth=auth,
            json={
                "textMessage": {"text": message},
                "phoneNumbers": [e164_phone],
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        msg_id = data.get("id")
        log.info("[OTP] sms-gate queued to +91%s — id=%s state=%s",
                 phone, msg_id, data.get("state"))

        # ── 3. Poll briefly to confirm the device picks it up ──────────
        import time
        for _ in range(4):
            time.sleep(2)
            try:
                status_resp = httpx.get(
                    f"{base_url}/message/{msg_id}", auth=auth, timeout=5.0)
                status_resp.raise_for_status()
                state = status_resp.json().get("state", "")
                if state in ("Processed", "Sent", "Delivered"):
                    log.info("[OTP] sms-gate message %s reached state: %s", msg_id, state)
                    return "sms_gate"
                if state == "Failed":
                    log.error("[OTP] sms-gate message %s FAILED — falling back to log", msg_id)
                    _log_otp_fallback(phone, code)
                    return "log"
            except Exception:
                break
        # Still Pending after polling — warn but don't fail (it may still deliver)
        log.warning("[OTP] sms-gate message %s still Pending after 8s — SMS may be delayed",
                    msg_id)
        return "sms_gate"

    except httpx.HTTPStatusError as exc:
        log.error("[OTP] sms-gate HTTP error %s for +91%s: %s",
                  exc.response.status_code, phone, exc.response.text)
        _log_otp_fallback(phone, code)
        return "log"
    except httpx.RequestError as exc:
        log.error("[OTP] sms-gate request error for +91%s: %s", phone, exc)
        _log_otp_fallback(phone, code)
        return "log"


def _log_otp_fallback(phone: str, code: str) -> None:
    """Fallback: log OTP to backend terminal when SMS delivery fails."""
    log.info("=" * 60)
    log.info("[OTP FALLBACK] SMS gateway unavailable!")
    log.info("[OTP FALLBACK] Phone: +91%s  |  Code: %s", phone, code)
    log.info("[OTP FALLBACK] Valid for %d minutes", settings.OTP_EXPIRE_MINUTES)
    log.info("=" * 60)


def request_otp(db: Session, phone: str, purpose: str = "register") -> dict:
    """Generate and 'send' an OTP. Returns only non-sensitive metadata —
    never the code itself — so the frontend/APK never sees it."""
    clean = normalise_phone(phone)
    if not clean:
        raise OTPError("Enter a valid 10-digit mobile number.", "invalid_phone")

    existing_user = db.query(User).filter(User.phone == clean).first()
    if purpose == "register" and existing_user:
        raise OTPError("This phone number is already registered. Try logging in instead.",
                       "already_registered")
    if purpose == "login" and not existing_user:
        raise OTPError("No account found with this phone number.", "not_registered")

    # Rate-limit resends so a farmer (or an attacker) can't spam the SMS
    # gateway / log by hammering this endpoint.
    recent = (db.query(PhoneOTP)
              .filter(PhoneOTP.phone == clean, PhoneOTP.purpose == purpose)
              .order_by(PhoneOTP.created_at.desc()).first())
    if recent:
        elapsed = (datetime.utcnow() - recent.created_at).total_seconds()
        if elapsed < settings.OTP_RESEND_COOLDOWN_SECONDS:
            wait = int(settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed)
            raise OTPError(f"Please wait {wait}s before requesting another code.",
                           "cooldown")

    code = f"{random.randint(0, 10**settings.OTP_LENGTH - 1):0{settings.OTP_LENGTH}d}"
    row = PhoneOTP(
        phone=clean, code_hash=hash_password(code), purpose=purpose,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
    )
    db.add(row); db.commit()

    actual_delivery = _deliver_otp(clean, code)

    return {
        "phone": clean,
        "expires_in_seconds": settings.OTP_EXPIRE_MINUTES * 60,
        "resend_after_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
        "delivery": actual_delivery,
    }


def verify_otp(db: Session, phone: str, code: str, purpose: str = "register") -> str:
    """Verify the code. On success, returns a short-lived, purpose-scoped
    JWT proving this phone was just verified — used to finish registration
    or complete a phone-based login, WITHOUT re-sending the OTP."""
    clean = normalise_phone(phone)
    if not clean:
        raise OTPError("Enter a valid 10-digit mobile number.", "invalid_phone")

    row = (db.query(PhoneOTP)
           .filter(PhoneOTP.phone == clean, PhoneOTP.purpose == purpose,
                   PhoneOTP.verified_at.is_(None))
           .order_by(PhoneOTP.created_at.desc()).first())
    if not row:
        raise OTPError("Request a new code first.", "no_pending_otp")
    if row.expires_at < datetime.utcnow():
        raise OTPError("This code has expired. Request a new one.", "expired")
    if row.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise OTPError("Too many incorrect attempts. Request a new code.", "too_many_attempts")

    row.attempts += 1
    if not verify_password(code.strip(), row.code_hash):
        db.commit()
        remaining = settings.OTP_MAX_ATTEMPTS - row.attempts
        raise OTPError(f"Incorrect code. {remaining} attempt(s) left.", "incorrect")

    row.verified_at = datetime.utcnow()
    db.commit()

    expire = datetime.utcnow() + timedelta(minutes=settings.PHONE_VERIFIED_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"phone": clean, "purpose": purpose, "exp": expire},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM,
    )


def resolve_verified_phone(token: str, purpose: str = "register") -> str:
    """Decode a phone-verification token from verify_otp(). Raises OTPError
    if invalid/expired/wrong purpose."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise OTPError("Phone verification expired. Please verify again.", "token_invalid")
    if payload.get("purpose") != purpose:
        raise OTPError("Phone verification expired. Please verify again.", "token_invalid")
    phone = payload.get("phone")
    if not phone:
        raise OTPError("Phone verification expired. Please verify again.", "token_invalid")
    return phone
