import os
import uuid
from datetime import datetime
import hashlib
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def generate_contract_pdf(contract, terms, buyer_name: str, farmer_name: str) -> str:
    """
    Generates a locked PDF for a Land Contract and returns the path.
    """
    filename = f"contract_{contract.id}_{uuid.uuid4().hex[:8]}.pdf"
    filepath = os.path.join(UPLOAD_DIR, filename)

    c = canvas.Canvas(filepath, pagesize=A4)
    width, height = A4
    y = height - 1 * inch
    margin = 1 * inch

    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, y, "LAND LEASE AGREEMENT")
    y -= 40

    c.setFont("Helvetica", 12)
    c.drawString(margin, y, f"Contract ID: {contract.id}")
    y -= 20
    c.drawString(margin, y, f"Date of Agreement: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    y -= 40

    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "PARTIES")
    y -= 20
    c.setFont("Helvetica", 12)
    c.drawString(margin, y, f"Farmer (Lessor): {farmer_name}")
    y -= 20
    c.drawString(margin, y, f"Buyer (Lessee): {buyer_name}")
    y -= 40

    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "AGREED TERMS")
    y -= 20
    c.setFont("Helvetica", 12)
    
    terms_text = [
        f"Duration: {terms.duration_months} months",
        f"Start Date: {terms.start_date.isoformat() if terms.start_date else 'N/A'}",
        f"End Date: {terms.end_date.isoformat() if terms.end_date else 'N/A'}",
        f"Rent Amount: INR {terms.rent_amount}",
        f"Security Deposit: INR {terms.security_deposit_amount}",
        f"Allowed Crops: {', '.join(terms.allowed_crops) if terms.allowed_crops else 'None specified'}",
        f"Renewal Terms: {terms.renewal_terms}",
        f"Exit Clause: {terms.exit_clause}",
        f"Special Conditions: {terms.special_conditions}"
    ]

    for line in terms_text:
        c.drawString(margin, y, line)
        y -= 20

    y -= 20
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "DIGITAL SIGNATURE & VERIFICATION")
    y -= 20
    c.setFont("Helvetica", 10)
    
    buyer_acc_str = terms.accepted_by_buyer_at.strftime('%Y-%m-%d %H:%M:%S') if terms.accepted_by_buyer_at else 'N/A'
    farmer_acc_str = terms.accepted_by_farmer_at.strftime('%Y-%m-%d %H:%M:%S') if terms.accepted_by_farmer_at else 'N/A'

    c.drawString(margin, y, f"Accepted by Buyer on: {buyer_acc_str} UTC")
    y -= 15
    c.drawString(margin, y, f"Accepted by Farmer on: {farmer_acc_str} UTC")
    y -= 30

    # Generate a simple hash of the terms to prove immutability
    content_str = f"{contract.id}|{farmer_name}|{buyer_name}|{terms.rent_amount}|{terms.duration_months}|{buyer_acc_str}|{farmer_acc_str}"
    doc_hash = hashlib.sha256(content_str.encode()).hexdigest()

    c.setFont("Courier", 8)
    c.drawString(margin, y, f"Document Hash (SHA-256): {doc_hash}")
    y -= 15
    c.drawString(margin, y, "This document is electronically generated and represents the mutually agreed terms.")

    c.save()

    return f"/uploads/{filename}"
