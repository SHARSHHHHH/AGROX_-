from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.security import get_current_user
from app.database.db import get_db
from app.models.models import User, LandContract, Review, Dispute
from pydantic import BaseModel

router = APIRouter(prefix="/api/trust", tags=["trust"])

class ReviewCreate(BaseModel):
    contract_id: int
    rating: int
    comment: str = ""

@router.post("/reviews")
def submit_review(req: ReviewCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = db.query(LandContract).filter(LandContract.id == req.contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
        
    if contract.status != "active" and contract.status != "completed":
        raise HTTPException(400, "Can only review active or completed contracts")
        
    if user.id not in [contract.buyer_id, contract.farmer_id]:
        raise HTTPException(403, "Not authorized to review this contract")
        
    reviewee_id = contract.farmer_id if user.id == contract.buyer_id else contract.buyer_id
    
    # Check if already reviewed
    existing = db.query(Review).filter(
        Review.contract_id == req.contract_id,
        Review.reviewer_id == user.id
    ).first()
    
    if existing:
        raise HTTPException(400, "Already reviewed this contract")
        
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(400, "Rating must be between 1 and 5")
        
    review = Review(
        contract_id=req.contract_id,
        reviewer_id=user.id,
        reviewee_id=reviewee_id,
        rating=req.rating,
        comment=req.comment
    )
    db.add(review)

    # Update user's aggregate trust score
    reviewee = db.query(User).filter(User.id == reviewee_id).first()
    if reviewee:
        total_rating = (reviewee.trust_score * reviewee.review_count) + req.rating
        reviewee.review_count += 1
        reviewee.trust_score = total_rating / reviewee.review_count

    db.commit()
    
    return {"status": "success", "message": "Review submitted successfully"}

class DisputeCreate(BaseModel):
    contract_id: int
    reason: str

@router.post("/disputes")
def open_dispute(req: DisputeCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = db.query(LandContract).filter(LandContract.id == req.contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
        
    if user.id not in [contract.buyer_id, contract.farmer_id]:
        raise HTTPException(403, "Not authorized to dispute this contract")
        
    dispute = Dispute(
        contract_id=req.contract_id,
        raised_by_id=user.id,
        reason=req.reason
    )
    db.add(dispute)
    
    # Optional: lock the contract or notify admin
    
    db.commit()
    
    return {"status": "success", "message": "Dispute opened successfully. Admin will review."}
