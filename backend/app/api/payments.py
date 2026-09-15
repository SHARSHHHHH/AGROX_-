import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.security import get_current_user
from app.database.db import get_db
from app.models.models import User, LandContract, EscrowPayment
from pydantic import BaseModel

router = APIRouter(prefix="/api/payments", tags=["payments"])

class CreatePaymentRequest(BaseModel):
    contract_id: int
    amount: float
    purpose: str

@router.post("/create-order")
def create_payment_order(req: CreatePaymentRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mock creating a Razorpay order for Escrow"""
    contract = db.query(LandContract).filter(LandContract.id == req.contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found")
        
    if contract.buyer_id != user.id:
        raise HTTPException(403, "Only buyer can initiate this payment")
        
    order_id = f"order_{uuid.uuid4().hex[:12]}"
    
    payment = EscrowPayment(
        contract_id=req.contract_id,
        payer_id=user.id,
        payee_id=contract.farmer_id,
        amount=req.amount,
        payment_gateway_order_id=order_id,
        purpose=req.purpose,
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    return {
        "status": "success",
        "order_id": order_id,
        "payment_id": payment.id,
        "amount": req.amount,
        "currency": "INR"
    }

class PaymentCallbackRequest(BaseModel):
    order_id: str
    payment_id: str
    signature: str

@router.post("/verify")
def verify_payment(req: PaymentCallbackRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mock webhook/callback to verify payment signature"""
    payment = db.query(EscrowPayment).filter(
        EscrowPayment.payment_gateway_order_id == req.order_id,
        EscrowPayment.payer_id == user.id
    ).first()
    
    if not payment:
        raise HTTPException(404, "Payment order not found")
        
    # In reality, verify signature using razorpay library
    # For now, mark as completed
    payment.payment_gateway_payment_id = req.payment_id
    payment.status = "completed"
    db.commit()
    
    return {"status": "success", "message": "Payment verified and escrow locked"}

@router.get("/contract/{contract_id}")
def get_contract_payments(contract_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payments = db.query(EscrowPayment).filter(EscrowPayment.contract_id == contract_id).all()
    
    # Optional: check auth
    
    return [
        {
            "id": p.id,
            "amount": p.amount,
            "status": p.status,
            "purpose": p.purpose,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in payments
    ]
