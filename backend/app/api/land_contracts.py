"""Land Contractors API.

Farmer side  — list land for seasonal rent
Buyer side   — browse listings, request a contract, see active contracts
               and what's growing on their rented land

Contract status flow:
    pending  → active    (farmer accepts)
    pending  → cancelled (farmer/buyer cancels)
    active   → completed (end_date reached or closed manually)
    active   → cancelled (early exit)
"""

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import uuid
import aiofiles

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

from app.core.security import get_current_user
from app.database.db import get_db
from app.models.models import (
    LandListing, LandContract, ContractMessage, User, LandContractTerms, 
    ContractAuditEvent, Notification, LandDocument, VerificationResult, ContractSignature
)
from app.services.pdf_generator import generate_contract_pdf
import hashlib

router = APIRouter(prefix="/api/land", tags=["land-contracts"])


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class PaymentScheduleItem(BaseModel):
    label: str
    amount: float
    due_event: str

class LandContractTermsIn(BaseModel):
    duration_months: int
    rent_amount: float
    payment_schedule: List[PaymentScheduleItem] = []
    security_deposit_amount: float = 0.0
    renewal_terms: str = ""
    exit_clause: str = ""
    allowed_crops: List[str] = []
    special_conditions: str = ""

class LandListingIn(BaseModel):
    title: str = ""
    description: str = ""
    state: str = ""
    district: str = ""
    taluk: str = ""
    village: str = ""
    survey_number: str = ""
    sub_division_number: str = ""
    area_acres: float = 1.0
    cultivable_area: float = 1.0
    land_type: str = "Agricultural"
    ownership_type: str = "Self Owned"
    owner_name: str = ""
    co_owner_names: str = ""
    num_co_owners: int = 0
    consent_status: str = ""
    lease_owner_name: str = ""
    lease_start_date: Optional[str] = None
    lease_end_date: Optional[str] = None
    soil_type: str = ""
    water_source: str = ""
    irrigation_available: bool = False
    irrigation_method: str = ""
    farming_method: str = ""
    suitable_crops: List[str] = []
    current_crop: str = ""
    expected_yield: str = ""
    price_per_acre_per_season: float = 0.0
    min_season_months: int = 1
    max_season_months: int = 12
    available_from: Optional[str] = None
    contact_phone: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_captured_at: Optional[str] = None
    status: str = "draft"
    
class LandListingUpdateIn(LandListingIn):
    pass


class ContractRequestIn(BaseModel):
    listing_id: int
    start_date: str          # ISO date string
    end_date: str            # ISO date string
    agreed_crop: str = ""
    buyer_notes: str = ""
    terms_accepted: bool = False


class ContractRespondIn(BaseModel):
    action: str              # "accept" | "decline"
    farmer_notes: str = ""


class MessageIn(BaseModel):
    content: str


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, "Dates must be ISO format yyyy-mm-dd or yyyy-mm-ddTHH:MM:SS")


def _listing_out(l: LandListing, reveal_phone: bool = False) -> dict:
    return {
        "id": l.id,
        "farmer_id": l.farmer_id,
        "farmer_name": l.farmer.name if l.farmer else "",
        "farmer_rating": l.farmer.trust_score if l.farmer else 0.0,
        "farmer_review_count": l.farmer.review_count if l.farmer else 0,
        "title": l.title,
        "description": l.description,
        "state": l.state,
        "district": l.district,
        "village": l.village,
        "taluk": l.taluk,
        "survey_number": l.survey_number,
        "sub_division_number": l.sub_division_number,
        "area_acres": l.area_acres,
        "cultivable_area": l.cultivable_area,
        "land_type": l.land_type,
        "ownership_type": l.ownership_type,
        "owner_name": l.owner_name,
        "co_owner_names": l.co_owner_names,
        "num_co_owners": l.num_co_owners,
        "consent_status": l.consent_status,
        "lease_owner_name": l.lease_owner_name,
        "lease_start_date": l.lease_start_date.isoformat() if l.lease_start_date else None,
        "lease_end_date": l.lease_end_date.isoformat() if l.lease_end_date else None,
        "soil_type": l.soil_type,
        "water_source": l.water_source,
        "irrigation_available": l.irrigation_available,
        "irrigation_method": l.irrigation_method,
        "farming_method": l.farming_method,
        "suitable_crops": l.suitable_crops or [],
        "current_crop": l.current_crop,
        "expected_yield": l.expected_yield,
        "price_per_acre_per_season": l.price_per_acre_per_season,
        "min_season_months": l.min_season_months,
        "max_season_months": l.max_season_months,
        "available_from": l.available_from.isoformat() if l.available_from else None,
        "status": l.status,
        "verification_status": l.verification_status,
        "risk_score": l.risk_score,
        "risk_level": l.risk_level,
        "image_path": l.image_path,
        "documents_path": l.documents_path,
        "views": l.views,
        "created_at": l.created_at.isoformat() if l.created_at else None,
        **({"contact_phone": l.contact_phone} if reveal_phone else {}),
    }


def _contract_out(c: LandContract) -> dict:
    return {
        "id": c.id,
        "listing_id": c.listing_id,
        "buyer_id": c.buyer_id,
        "farmer_id": c.farmer_id,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "agreed_crop": c.agreed_crop,
        "price_per_acre": c.price_per_acre,
        "total_price": c.total_price,
        "status": c.status,
        "terms_accepted": c.terms_accepted,
        "contract_pdf_url": c.contract_pdf_url,
        "farmer_notes": c.farmer_notes,
        "buyer_notes": c.buyer_notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        # Denorm for UI convenience
        "listing_title": c.listing.title if c.listing else "",
        "listing_area_acres": c.listing.area_acres if c.listing else 0,
        "listing_state": c.listing.state if c.listing else "",
        "listing_district": c.listing.district if c.listing else "",
        "listing_village": c.listing.village if c.listing else "",
        "listing_suitable_crops": c.listing.suitable_crops if c.listing else [],
        "farmer_name": c.farmer.name if c.farmer else "",
        "buyer_name": c.buyer.name if c.buyer else "",
    }


# ─── Farmer endpoints ─────────────────────────────────────────────────────────

@router.post("/listings")
def create_listing(
    body: LandListingIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Farmer lists a plot of land available for seasonal rent."""
    if user.role not in ("farmer", "admin"):
        raise HTTPException(403, "Only farmers can create land listings")

    listing = LandListing(
        farmer_id=user.id,
        title=body.title,
        description=body.description,
        state=body.state or user.state,
        district=body.district or user.district,
        taluk=body.taluk,
        village=body.village,
        survey_number=body.survey_number,
        sub_division_number=body.sub_division_number,
        area_acres=body.area_acres,
        cultivable_area=body.cultivable_area,
        land_type=body.land_type,
        ownership_type=body.ownership_type,
        owner_name=body.owner_name,
        co_owner_names=body.co_owner_names,
        num_co_owners=body.num_co_owners,
        consent_status=body.consent_status,
        lease_owner_name=body.lease_owner_name,
        lease_start_date=_parse_date(body.lease_start_date),
        lease_end_date=_parse_date(body.lease_end_date),
        soil_type=body.soil_type,
        water_source=body.water_source,
        irrigation_available=body.irrigation_available,
        irrigation_method=body.irrigation_method,
        farming_method=body.farming_method,
        suitable_crops=body.suitable_crops,
        current_crop=body.current_crop,
        expected_yield=body.expected_yield,
        price_per_acre_per_season=body.price_per_acre_per_season,
        min_season_months=body.min_season_months,
        max_season_months=body.max_season_months,
        available_from=_parse_date(body.available_from),
        contact_phone=body.contact_phone,
        latitude=body.latitude,
        longitude=body.longitude,
        location_captured_at=_parse_date(body.location_captured_at),
        status=body.status,
        verification_status="pending",
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    
    # Audit log
    audit = ContractAuditEvent(
        land_id=listing.id,
        actor_user_id=user.id,
        action="LAND_CREATED" if body.status != "draft" else "DRAFT_CREATED",
        description="Farmer created land listing"
    )
    db.add(audit)
    db.commit()
    
    return _listing_out(listing)
    
@router.patch("/listings/{listing_id}")
def update_listing(
    listing_id: int,
    body: LandListingUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Farmer updates a land listing (useful for step-by-step saving)."""
    listing = db.get(LandListing, listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing.farmer_id != user.id:
        raise HTTPException(403, "Not your listing")
        
    for k, v in body.dict(exclude_unset=True).items():
        if k in ("available_from", "lease_start_date", "lease_end_date", "location_captured_at"):
            setattr(listing, k, _parse_date(v))
        else:
            setattr(listing, k, v)
            
    db.commit()
    db.refresh(listing)
    
    # Audit log
    audit = ContractAuditEvent(
        land_id=listing.id,
        actor_user_id=user.id,
        action="LAND_UPDATED",
        description="Farmer updated land listing"
    )
    db.add(audit)
    db.commit()
    
    return _listing_out(listing)


@router.get("/my-listings")
def my_listings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All listings posted by the logged-in farmer (includes contact)."""
    rows = db.query(LandListing).filter(
        LandListing.farmer_id == user.id
    ).order_by(LandListing.created_at.desc()).all()
    return [_listing_out(r, reveal_phone=True) for r in rows]


@router.post("/listings/{listing_id}/documents")
async def upload_land_documents(
    listing_id: int,
    document_type: str = Query("Other Supporting Document"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Farmer uploads a structured land document."""
    listing = db.get(LandListing, listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing.farmer_id != user.id and user.role != "admin":
        raise HTTPException(403, "Not your listing")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".pdf"):
        raise HTTPException(400, "Please upload a JPG, PNG, WEBP, or PDF file.")
        
    content = await file.read()
    file_size = len(content)
    if file_size > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10MB)")
        
    file_hash = hashlib.sha256(content).hexdigest()
    
    # Check duplicate document hash
    existing_doc = db.query(LandDocument).filter(LandDocument.file_hash == file_hash).first()
    if existing_doc and existing_doc.land_id != listing_id:
        # Note: in real world we might flag this as risk, for demo we allow but flag later
        pass

    path = os.path.join(UPLOAD_DIR, f"doc_{uuid.uuid4().hex}{ext}")
    async with aiofiles.open(path, "wb") as f:
        await f.write(content)
        
    doc_url = f"/uploads/{os.path.basename(path)}"
    
    doc = LandDocument(
        land_id=listing.id,
        document_type=document_type,
        storage_reference=doc_url,
        file_hash=file_hash,
        mime_type=file.content_type or "",
        file_size=file_size,
        processing_status="processed", # Mock processing
        ocr_status="success", # Mock OCR
        uploaded_by=user.id
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # Audit log
    audit = ContractAuditEvent(
        land_id=listing.id,
        actor_user_id=user.id,
        action="DOCUMENT_UPLOADED",
        description=f"Uploaded {document_type}"
    )
    db.add(audit)
    db.commit()

    return {
        "id": doc.id,
        "document_type": doc.document_type,
        "storage_reference": doc.storage_reference,
        "processing_status": doc.processing_status,
        "ocr_status": doc.ocr_status
    }
    
@router.get("/listings/{listing_id}/documents")
def get_land_documents(
    listing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    listing = db.get(LandListing, listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
        
    # Security: only farmer, or admin, or buyer with active contract can view
    can_view = False
    if listing.farmer_id == user.id or user.role == "admin":
        can_view = True
    else:
        contract = db.query(LandContract).filter(
            LandContract.listing_id == listing_id,
            LandContract.buyer_id == user.id
        ).first()
        if contract:
            can_view = True
            
    if not can_view:
        raise HTTPException(403, "Not authorized to view these documents")
        
    docs = db.query(LandDocument).filter(LandDocument.land_id == listing_id).all()
    return [{
        "id": d.id,
        "document_type": d.document_type,
        "storage_reference": d.storage_reference,
        "processing_status": d.processing_status,
        "ocr_status": d.ocr_status,
        "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None
    } for d in docs]


@router.get("/validate-survey")
def validate_survey(
    survey_number: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Real-time validation for survey numbers."""
    if not survey_number:
        return {"valid": False, "message": "Survey number is required"}
        
    existing = db.query(LandListing).filter(LandListing.survey_number == survey_number).first()
    if existing:
        return {"valid": False, "message": "Survey number already registered", "duplicate": True}
        
    return {"valid": True, "message": "Format valid"}

@router.post("/listings/{listing_id}/submit")
def submit_listing_for_verification(
    listing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submits a drafted listing for verification."""
    listing = db.get(LandListing, listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing.farmer_id != user.id:
        raise HTTPException(403, "Not your listing")
        
    # Mock Risk Assessment & OCR check
    docs = db.query(LandDocument).filter(LandDocument.land_id == listing_id).all()
    risk_score = 12 if docs else 82 # Simple mock logic: low risk if docs exist
    risk_level = "LOW" if risk_score < 40 else "HIGH"
    
    listing.status = "processing"
    db.commit()
    
    # Audit log
    audit = ContractAuditEvent(
        land_id=listing.id,
        actor_user_id=user.id,
        action="LAND_SUBMITTED",
        description="Farmer submitted land for verification"
    )
    db.add(audit)
    
    # Create verification result
    result = VerificationResult(
        land_id=listing.id,
        owner_match=True,
        survey_match=True,
        area_match=True,
        location_match=True,
        duplicate_check=True,
        document_integrity=True,
        risk_score=risk_score,
        risk_level=risk_level,
        reasons=["Owner mismatch"] if risk_level == "HIGH" else []
    )
    db.add(result)
    
    # Auto-verify for prototype if low risk
    if risk_level == "LOW":
        listing.status = "verified"
        listing.verification_status = "verified"
        audit2 = ContractAuditEvent(
            land_id=listing.id,
            actor_user_id=user.id,
            action="LAND_VERIFIED",
            description="System verified land automatically"
        )
        db.add(audit2)
    else:
        listing.status = "under_review"
        listing.verification_status = "pending"
        
    listing.risk_score = risk_score
    listing.risk_level = risk_level
        
    db.commit()
    db.refresh(listing)
    
    return _listing_out(listing)

@router.delete("/listings/{listing_id}")
def withdraw_listing(
    listing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Farmer withdraws a listing (marks it withdrawn, doesn't delete)."""
    listing = db.get(LandListing, listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing.farmer_id != user.id and user.role != "admin":
        raise HTTPException(403, "Not your listing")
    listing.status = "withdrawn"
    db.commit()
    return {"ok": True}


@router.get("/contracts/incoming")
def incoming_contracts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Farmer sees contract requests sent by buyers for their land."""
    rows = db.query(LandContract).filter(
        LandContract.farmer_id == user.id
    ).order_by(LandContract.created_at.desc()).all()
    return [_contract_out(c) for c in rows]


@router.post("/contracts/{contract_id}/respond")
def respond_to_contract(
    contract_id: int,
    body: ContractRespondIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Farmer accepts or declines a pending contract request."""
    contract = db.get(LandContract, contract_id)
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.farmer_id != user.id:
        raise HTTPException(403, "Not your contract")
    if contract.status != "pending":
        raise HTTPException(400, f"Contract is already '{contract.status}'")

    if body.action == "accept":
        contract.status = "active"
        # Mark the listing as rented so it disappears from browse
        listing = db.get(LandListing, contract.listing_id)
        if listing:
            listing.status = "rented"
    elif body.action == "decline":
        contract.status = "cancelled"
    else:
        raise HTTPException(400, "action must be 'accept' or 'decline'")

    contract.farmer_notes = body.farmer_notes
    db.commit()

    # Create Notification for buyer
    action_text = "accepted" if body.action == "accept" else "declined"
    notif = Notification(
        recipient_id=contract.buyer_id,
        notification_type="land_contract",
        title=f"Contract Request {action_text.title()}",
        message=f"Your contract request for {contract.listing.area_acres if contract.listing else 'land'} acres was {action_text}.",
        url="/contractors"
    )
    db.add(notif)
    db.commit()

    db.refresh(contract)
    return _contract_out(contract)


# ─── Buyer endpoints ──────────────────────────────────────────────────────────

@router.get("/browse")
def browse_listings(
    state: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    soil_type: Optional[str] = Query(None),
    irrigation: Optional[bool] = Query(None),
    crop: Optional[str] = Query(None),
    min_acres: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Buyers browse land available for rent with rich filters."""
    q = db.query(LandListing).filter(LandListing.status == "available")
    if state:
        q = q.filter(LandListing.state.ilike(f"%{state}%"))
    if district:
        q = q.filter(LandListing.district.ilike(f"%{district}%"))
    if soil_type:
        q = q.filter(LandListing.soil_type.ilike(f"%{soil_type}%"))
    if irrigation is not None:
        q = q.filter(LandListing.irrigation_available == irrigation)
    if min_acres:
        q = q.filter(LandListing.area_acres >= min_acres)
    if max_price:
        q = q.filter(LandListing.price_per_acre_per_season <= max_price)

    rows = q.order_by(LandListing.created_at.desc()).limit(100).all()

    # Client-side crop filter (JSON array — SQLite can't query JSON easily)
    if crop:
        crop_lower = crop.lower()
        rows = [r for r in rows
                if any(crop_lower in c.lower() for c in (r.suitable_crops or []))]

    # Increment view counters in bulk
    for r in rows:
        r.views = (r.views or 0) + 1
    db.commit()

    return [_listing_out(r) for r in rows]


@router.get("/listings/{listing_id}")
def listing_detail(
    listing_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Full listing detail. Contact phone is NOT included here — use /contact."""
    listing = db.get(LandListing, listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    return _listing_out(listing)


@router.get("/listings/{listing_id}/contact")
def reveal_contact(
    listing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reveal farmer contact phone after buyer expresses serious intent."""
    listing = db.get(LandListing, listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    return {
        "farmer_name": listing.farmer.name,
        "contact_phone": listing.contact_phone,
        "safety_note": (
            "Always meet at the land in daylight and verify land ownership documents "
            "before transferring any payment."
        ),
    }


@router.post("/contracts")
def request_contract(
    body: ContractRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Buyer submits a contract request for a land listing."""
    listing = db.get(LandListing, body.listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing.status != "available":
        raise HTTPException(400, f"Land is not available (status: {listing.status})")

    start = _parse_date(body.start_date)
    end = _parse_date(body.end_date)
    if not start or not end:
        raise HTTPException(400, "start_date and end_date are required")
    if end <= start:
        raise HTTPException(400, "end_date must be after start_date")

    months = max(1, round((end - start).days / 30))
    total = listing.price_per_acre_per_season * listing.area_acres * (months / 6)

    contract = LandContract(
        listing_id=listing.id,
        buyer_id=user.id,
        farmer_id=listing.farmer_id,
        start_date=start,
        end_date=end,
        agreed_crop=body.agreed_crop,
        price_per_acre=listing.price_per_acre_per_season,
        total_price=total,
        status="pending",
        terms_accepted=body.terms_accepted,
        buyer_notes=body.buyer_notes,
    )
    db.add(contract)
    db.commit()

    # Notify farmer
    notif = Notification(
        recipient_id=contract.farmer_id,
        notification_type="land_contract",
        title="New Contract Request",
        message=f"{user.name} sent a contract request for {listing.area_acres} acres.",
        url="/farmer-land"
    )
    db.add(notif)
    db.commit()

    db.refresh(contract)
    return _contract_out(contract)


@router.get("/my-contracts")
def my_contracts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Buyer's own contracts — pending, active, completed, cancelled."""
    rows = db.query(LandContract).filter(
        LandContract.buyer_id == user.id
    ).order_by(LandContract.created_at.desc()).all()
    return [_contract_out(c) for c in rows]


@router.post("/contracts/{contract_id}/cancel")
def cancel_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Buyer cancels a pending contract (cannot cancel active ones unilaterally)."""
    contract = db.get(LandContract, contract_id)
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id:
        raise HTTPException(403, "Not your contract")
    if contract.status != "pending":
        raise HTTPException(400, "Only pending contracts can be cancelled by the buyer")
    contract.status = "cancelled"
    db.commit()
    db.refresh(contract)
    return _contract_out(contract)


@router.get("/stats")
def land_stats(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Quick summary numbers for the buyer dashboard header."""
    available = db.query(LandListing).filter(LandListing.status == "available").count()
    rented = db.query(LandListing).filter(LandListing.status == "rented").count()
    return {"available_plots": available, "rented_plots": rented}


# ─── Messaging endpoints ──────────────────────────────────────────────────────

@router.get("/contracts/{contract_id}/messages")
def get_contract_messages(
    contract_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get all messages for a specific contract."""
    contract = db.get(LandContract, contract_id)
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id and contract.farmer_id != user.id and user.role != "admin":
        raise HTTPException(403, "Not authorized to view these messages")

    messages = db.query(ContractMessage).filter(
        ContractMessage.contract_id == contract_id
    ).order_by(ContractMessage.created_at.asc()).all()
    
    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "sender_name": m.sender.name if m.sender else "",
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "is_mine": m.sender_id == user.id
        }
        for m in messages
    ]


@router.post("/contracts/{contract_id}/messages")
def send_contract_message(
    contract_id: int,
    body: MessageIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a message regarding a specific contract."""
    contract = db.get(LandContract, contract_id)
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id and contract.farmer_id != user.id:
        raise HTTPException(403, "Not authorized to send messages for this contract")

    msg = ContractMessage(
        contract_id=contract_id,
        sender_id=user.id,
        content=body.content
    )
    db.add(msg)
    
    # Notify recipient
    recipient_id = contract.farmer_id if user.id == contract.buyer_id else contract.buyer_id
    notif = Notification(
        recipient_id=recipient_id,
        notification_type="contract_message",
        title=f"New Message from {user.name}",
        message=body.content,
        url="/contractors" if user.id == contract.farmer_id else "/farmer-land"
    )
    db.add(notif)
    
    db.commit()
    db.refresh(msg)
    
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "sender_name": user.name,
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "is_mine": True
    }

# ─── Terms Endpoints ──────────────────────────────────────────────────────────

@router.post("/contracts/{contract_id:int}/terms")
def propose_terms(contract_id: int, data: LandContractTermsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = db.query(LandContract).filter(LandContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id and contract.farmer_id != user.id:
        raise HTTPException(403, "Not authorized to propose terms for this contract")

    current_draft = db.query(LandContractTerms).filter(
        LandContractTerms.contract_id == contract_id,
        LandContractTerms.superseded_by_id == None
    ).order_by(LandContractTerms.version.desc()).first()

    new_version = 1
    if current_draft:
        new_version = current_draft.version + 1

    new_terms = LandContractTerms(
        contract_id=contract_id,
        version=new_version,
        duration_months=data.duration_months,
        rent_amount=data.rent_amount,
        payment_schedule=[p.dict() for p in data.payment_schedule],
        security_deposit_amount=data.security_deposit_amount,
        renewal_terms=data.renewal_terms,
        exit_clause=data.exit_clause,
        allowed_crops=data.allowed_crops,
        special_conditions=data.special_conditions,
        created_by_user_id=user.id
    )
    
    if user.id == contract.buyer_id:
        new_terms.accepted_by_buyer_at = datetime.utcnow()
    else:
        new_terms.accepted_by_farmer_at = datetime.utcnow()

    db.add(new_terms)
    db.commit()
    db.refresh(new_terms)
    
    if current_draft and not (current_draft.accepted_by_buyer_at and current_draft.accepted_by_farmer_at):
        current_draft.superseded_by_id = new_terms.id
        db.commit()

    return {"status": "success", "terms_id": new_terms.id, "version": new_terms.version}


@router.get("/contracts/{contract_id:int}/terms")
def get_terms_history(contract_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = db.query(LandContract).filter(LandContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id and contract.farmer_id != user.id:
        raise HTTPException(403, "Not authorized to view terms for this contract")
        
    terms = db.query(LandContractTerms).filter(
        LandContractTerms.contract_id == contract_id
    ).order_by(LandContractTerms.version.desc()).all()
    
    return [
        {
            "id": t.id,
            "version": t.version,
            "duration_months": t.duration_months,
            "rent_amount": t.rent_amount,
            "payment_schedule": t.payment_schedule,
            "security_deposit_amount": t.security_deposit_amount,
            "renewal_terms": t.renewal_terms,
            "exit_clause": t.exit_clause,
            "allowed_crops": t.allowed_crops,
            "special_conditions": t.special_conditions,
            "created_by_user_id": t.created_by_user_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "accepted_by_buyer_at": t.accepted_by_buyer_at.isoformat() if t.accepted_by_buyer_at else None,
            "accepted_by_farmer_at": t.accepted_by_farmer_at.isoformat() if t.accepted_by_farmer_at else None,
            "superseded_by_id": t.superseded_by_id
        }
        for t in terms
    ]


@router.post("/contracts/{contract_id:int}/terms/{terms_id:int}/accept")
def accept_terms(contract_id: int, terms_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = db.query(LandContract).filter(LandContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id and contract.farmer_id != user.id:
        raise HTTPException(403, "Not authorized to accept terms for this contract")
        
    term = db.query(LandContractTerms).filter(
        LandContractTerms.id == terms_id, 
        LandContractTerms.contract_id == contract_id
    ).first()
    
    if not term:
        raise HTTPException(404, "Terms version not found")
        
    if term.superseded_by_id is not None:
        raise HTTPException(400, "Cannot accept superseded terms")
        
    if user.id == contract.buyer_id:
        term.accepted_by_buyer_at = datetime.utcnow()
        audit_desc = "Buyer accepted terms"
    else:
        term.accepted_by_farmer_at = datetime.utcnow()
        audit_desc = "Farmer accepted terms"
        
    db.commit()
    
    audit = ContractAuditEvent(
        contract_id=contract.id,
        actor_user_id=user.id,
        action="TERMS_ACCEPTED",
        description=audit_desc,
        version_number=term.version
    )
    db.add(audit)
    
    if term.accepted_by_buyer_at and term.accepted_by_farmer_at:
        contract.terms_accepted = True
        contract.status = "ready_for_signing"
        
        # Generate Immutable PDF
        buyer = db.query(User).filter(User.id == contract.buyer_id).first()
        farmer = db.query(User).filter(User.id == contract.farmer_id).first()
        pdf_url = generate_contract_pdf(contract, term, buyer.name, farmer.name)
        contract.contract_pdf_url = pdf_url

        db.add(ContractAuditEvent(
            contract_id=contract.id,
            actor_user_id=user.id,
            action="CONTRACT_FINALIZED",
            description="Contract terms finalized and ready for signing",
            version_number=term.version
        ))

        db.commit()
        
    return {"status": "success", "message": "Terms accepted"}

class SignContractIn(BaseModel):
    otp: str
    authorization_confirmed: bool

@router.post("/contracts/{contract_id:int}/sign")
def sign_contract(contract_id: int, body: SignContractIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mock OTP signing flow."""
    contract = db.query(LandContract).filter(LandContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id and contract.farmer_id != user.id:
        raise HTTPException(403, "Not authorized to sign this contract")
    if contract.status != "ready_for_signing" and contract.status != "partially_signed":
        raise HTTPException(400, f"Contract is not ready for signing (status: {contract.status})")
    if not body.authorization_confirmed:
        raise HTTPException(400, "You must confirm authorization to sign")
    if body.otp != "123456": # Mock OTP validation
        raise HTTPException(400, "Invalid OTP")

    # Check for duplicate signing
    existing_sig = db.query(ContractSignature).filter(
        ContractSignature.contract_id == contract_id,
        ContractSignature.user_id == user.id
    ).first()
    if existing_sig:
        raise HTTPException(400, "You have already signed this contract")

    role = "buyer" if user.id == contract.buyer_id else "farmer"
    
    sig = ContractSignature(
        contract_id=contract_id,
        version_number=contract.version,
        user_id=user.id,
        role=role,
        authorization_confirmed=True,
        signature_reference=f"SIG-{uuid.uuid4().hex[:8]}"
    )
    db.add(sig)
    
    audit = ContractAuditEvent(
        contract_id=contract.id,
        actor_user_id=user.id,
        action=f"{role.upper()}_SIGNED",
        description=f"{role.capitalize()} signed the contract via OTP",
        version_number=contract.version
    )
    db.add(audit)
    
    db.commit()
    
    # Check if both have signed
    sigs = db.query(ContractSignature).filter(ContractSignature.contract_id == contract_id).all()
    if len(sigs) >= 2:
        contract.status = "active"
        
        # SHA-256 Integrity
        raw_data = f"{contract.id}-{contract.farmer_id}-{contract.buyer_id}-{contract.version}-{contract.contract_pdf_url}"
        contract.hash = hashlib.sha256(raw_data.encode()).hexdigest()
        
        db.add(ContractAuditEvent(
            contract_id=contract.id,
            actor_user_id=user.id,
            action="CONTRACT_ACTIVATED",
            description="Contract activated with SHA-256 integrity hash",
            version_number=contract.version
        ))
        
    else:
        contract.status = "partially_signed"

    db.commit()
    return {"status": "success", "message": "Contract signed successfully", "contract_status": contract.status}

@router.get("/contracts/{contract_id:int}/audit")
def get_contract_audit(contract_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = db.query(LandContract).filter(LandContract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
    if contract.buyer_id != user.id and contract.farmer_id != user.id and user.role != "admin":
        raise HTTPException(403, "Not authorized to view audit trail")
        
    events = db.query(ContractAuditEvent).filter(
        ContractAuditEvent.contract_id == contract_id
    ).order_by(ContractAuditEvent.timestamp.asc()).all()
    
    return [
        {
            "id": e.id,
            "action": e.action,
            "actor_role": e.actor_role,
            "description": e.description,
            "version_number": e.version_number,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        }
        for e in events
    ]
