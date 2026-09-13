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


def _deliver_otp(phone: str, code: str) -> None:
    """Send the OTP to the farmer. Swappable per Settings.SMS_PROVIDER.

    Only "log" is implemented today (prints to the backend's own terminal —
    fine for development/demo, since there is no real SMS gateway wired in
    yet). To go live, add a branch here that calls your SMS provider using
    Settings.SMS_API_KEY, and flip SMS_PROVIDER in .env. Nothing on the
    frontend or in the API response changes either way.
    """
    if settings.SMS_PROVIDER == "log":
        log.info("[OTP] SMS to +91%s: your AGROX verification code is %s "
                 "(valid %d min)", phone, code, settings.OTP_EXPIRE_MINUTES)
    else:
        log.warning("[OTP] SMS_PROVIDER=%s is not implemented; falling back "
                    "to logging the code instead of sending it.", settings.SMS_PROVIDER)
        log.info("[OTP] SMS to +91%s: code %s", phone, code)


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

    _deliver_otp(clean, code)

    return {
        "phone": clean,
        "expires_in_seconds": settings.OTP_EXPIRE_MINUTES * 60,
        "resend_after_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
        # Only ever true when there really is no SMS gateway configured, so
        # the demo/test UI can say "check the backend log" instead of
        # falsely promising an SMS that will never arrive.
        "delivery": settings.SMS_PROVIDER,
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
