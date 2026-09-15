from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database.db import get_db
from app.models.models import User
from app.schemas.schemas import (RegisterIn, RegisterFarmerIn, OTPRequestIn,
                                 OTPVerifyIn, Token, UserOut)
from app.core.security import hash_password, verify_password, create_token, get_current_user
from app.services import otp_service
from app.services.otp_service import OTPError

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Email + password registration/login — UNCHANGED, still used by balcony
# growers, buyers, and admins. Farmers now go through the phone+OTP flow
# below instead (see RegisterFarmerIn / /otp/*).
# ---------------------------------------------------------------------------
@router.post("/register", response_model=Token)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if data.mode == "farm":
        raise HTTPException(400, "Farmer accounts must register with a phone "
                                 "number via /api/auth/otp/request — see "
                                 "/api/auth/register-farmer.")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")
    role_map = {"balcony": "balcony", "buyer": "buyer"}
    role = role_map.get(data.mode, "farmer")
    user = User(name=data.name, email=data.email,
                hashed_password=hash_password(data.password),
                role=role, mode=data.mode, language=data.language,
                state=data.state, district=data.district)
    db.add(user); db.commit(); db.refresh(user)
    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # OAuth2 form uses 'username' — accept either an email (balcony/buyer/
    # admin) or a phone number (farmer) in that same field, so the login
    # screen doesn't need two different forms.
    identifier = form.username.strip()
    phone = otp_service.normalise_phone(identifier)
    query = db.query(User).filter(User.email == identifier)
    if phone:
        query = db.query(User).filter(or_(User.email == identifier, User.phone == phone))
    user = query.first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email/phone or password")
    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


# ---------------------------------------------------------------------------
# Phone + OTP flow (farmers)
#
#   POST /otp/request   {phone, purpose: "register"}  -> OTP sent (logged)
#   POST /otp/verify     {phone, code, purpose}         -> phone_verified_token
#   POST /register-farmer {name, phone, password,
#                           confirm_password, phone_verified_token}  -> Token
#
#   Login (existing account) re-uses the same two OTP endpoints with
#   purpose="login", then:
#   POST /login-farmer {phone, phone_verified_token}     -> Token
#   (a farmer who still remembers their password can also just use the
#   regular /login endpoint above — phone is tried there too.)
# ---------------------------------------------------------------------------
@router.post("/otp/request")
def request_otp(data: OTPRequestIn, db: Session = Depends(get_db)):
    try:
        return otp_service.request_otp(db, data.phone, data.purpose)
    except OTPError as e:
        raise HTTPException(400, e.args[0])
    except Exception as e:
        # SMS gateway connectivity failure — tell the client clearly.
        raise HTTPException(502, f"Could not send SMS: {e}")


@router.post("/otp/verify")
def verify_otp(data: OTPVerifyIn, db: Session = Depends(get_db)):
    try:
        token = otp_service.verify_otp(db, data.phone, data.code, data.purpose)
    except OTPError as e:
        raise HTTPException(400, e.args[0])
    return {"phone_verified_token": token}


@router.post("/register-farmer", response_model=Token)
def register_farmer(data: RegisterFarmerIn, db: Session = Depends(get_db)):
    if data.password != data.confirm_password:
        raise HTTPException(400, "Password and confirm password do not match.")
    if len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")

    try:
        verified_phone = otp_service.resolve_verified_phone(
            data.phone_verified_token, purpose="register")
    except OTPError as e:
        raise HTTPException(400, e.args[0])

    phone = otp_service.normalise_phone(data.phone)
    if not phone or phone != verified_phone:
        raise HTTPException(400, "Phone number does not match the verified number.")
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(400, "This phone number is already registered.")

    user = User(name=data.name, phone=phone,
                hashed_password=hash_password(data.password),
                role="farmer", mode="farm", language=data.language,
                state=data.state, district=data.district)
    db.add(user); db.commit(); db.refresh(user)
    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/login-farmer", response_model=Token)
def login_farmer(data: dict, db: Session = Depends(get_db)):
    """Passwordless login: phone + a phone_verified_token from /otp/verify
    (purpose=login). Useful for farmers who forgot their password — the
    password-based /login endpoint above still works too."""
    token = data.get("phone_verified_token", "")
    try:
        verified_phone = otp_service.resolve_verified_phone(token, purpose="login")
    except OTPError as e:
        raise HTTPException(400, e.args[0])

    user = db.query(User).filter(User.phone == verified_phone).first()
    if not user:
        raise HTTPException(404, "No account found with this phone number.")
    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
