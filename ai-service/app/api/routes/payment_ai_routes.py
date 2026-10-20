import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from app.models.database import get_db, AIOutputLog
from app.services.foms_client import FomsClient

logger = logging.getLogger(__name__)
router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# Request and Response Schemas
# ─────────────────────────────────────────────────────────────────────────────
class DuplicateReferenceRequest(BaseModel):
    reference_number: str
    current_payment_id: Optional[str] = None

class AmountMismatchRequest(BaseModel):
    invoice_id: str
    amount: float

class ValidationAssistRequest(BaseModel):
    payment_id: str
    invoice_id: str
    amount: float
    reference_number: str
    trace_id: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/payments/check-duplicate-reference")
def check_duplicate_reference(request: DuplicateReferenceRequest):
    """
    Checks if a reference number (PayMongo/SpeedPay) has already been used
    in any existing payments in the C# backend.
    """
    try:
        foms = FomsClient()
        payments = foms.get_payments()
        
        duplicates = []
        ref_to_check = request.reference_number.strip().upper() if request.reference_number else ""
        
        if not ref_to_check:
            return {"is_duplicate": False, "duplicates": []}

        for p in payments:
            if p.get("id") == request.current_payment_id:
                continue
                
            refs = [
                p.get("referenceNumber"),
                p.get("payMongoReference"),
                p.get("speedPayReference")
            ]
            refs = [r.strip().upper() for r in refs if r]
            
            if ref_to_check in refs:
                duplicates.append({
                    "payment_id": p.get("id"),
                    "invoice_no": p.get("invoiceNo"),
                    "amount": p.get("amount"),
                    "status": p.get("status"),
                    "date": p.get("date")
                })
                
        return {
            "is_duplicate": len(duplicates) > 0,
            "duplicates": duplicates
        }
    except Exception as e:
        logger.error(f"Error checking duplicate reference: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal check error: {str(e)}")


@router.post("/payments/check-amount-mismatch")
def check_amount_mismatch(request: AmountMismatchRequest):
    """
    Checks if a given payment amount differs from the outstanding balance of the invoice.
    """
    try:
        foms = FomsClient()
        invoices = foms.get_invoices()
        
        invoice = next(
            (i for i in invoices if i.get("id") == request.invoice_id or i.get("invoiceNo") == request.invoice_id),
            None
        )
        if not invoice:
            raise HTTPException(status_code=404, detail=f"Invoice '{request.invoice_id}' not found.")
            
        balance = float(invoice.get("balance", 0.0))
        payment_amount = float(request.amount)
        
        difference = balance - payment_amount
        mismatch_detected = abs(difference) > 0.01
        is_overpayment = payment_amount > balance
        
        return {
            "mismatch_detected": mismatch_detected,
            "invoice_balance": balance,
            "payment_amount": payment_amount,
            "difference": difference,
            "is_overpayment": is_overpayment
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking amount mismatch: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal check error: {str(e)}")


@router.post("/payments/validation-assist")
def validation_assist(request: ValidationAssistRequest, db: Session = Depends(get_db)):
    """
    Runs automated checks and returns validation suggestions for the finance managers.
    """
    try:
        foms = FomsClient()
        payments = foms.get_payments()
        invoices = foms.get_invoices()
        
        # 1. Duplicate check
        is_duplicate = False
        duplicate_ref = None
        ref_to_check = request.reference_number.strip().upper() if request.reference_number else ""
        
        if ref_to_check:
            for p in payments:
                if p.get("id") == request.payment_id:
                    continue
                refs = [p.get("referenceNumber"), p.get("payMongoReference"), p.get("speedPayReference")]
                refs = [r.strip().upper() for r in refs if r]
                if ref_to_check in refs:
                    is_duplicate = True
                    duplicate_ref = p.get("id")
                    break

        # 2. Mismatch and Overpayment check
        invoice = next(
            (i for i in invoices if i.get("id") == request.invoice_id or i.get("invoiceNo") == request.invoice_id),
            None
        )
        invoice_balance = 0.0
        mismatch_detected = False
        is_overpayment = False
        
        if invoice:
            invoice_balance = float(invoice.get("balance", 0.0))
            mismatch_detected = abs(invoice_balance - float(request.amount)) > 0.01
            is_overpayment = float(request.amount) > invoice_balance

        # 3. Advisory Determination
        reasons = []
        severity = "Low"
        if is_duplicate:
            status = "Possible Duplicate"
            reasons.append(f"Reference number '{request.reference_number}' matches existing payment '{duplicate_ref}'.")
            severity = "High"
        elif is_overpayment:
            status = "Needs Review"
            reasons.append(f"Payment of {request.amount:,.2f} is an overpayment (Invoice balance is {invoice_balance:,.2f}).")
            severity = "Medium"
        elif mismatch_detected:
            status = "Amount Mismatch"
            reasons.append(f"Payment of {request.amount:,.2f} does not match outstanding balance of {invoice_balance:,.2f}.")
            severity = "Medium"
        elif request.amount > 500000.00:
            status = "High Risk"
            reasons.append("Suspiciously high payment amount (greater than 500,000.00).")
            severity = "High"
        else:
            status = "Cleared for Manual Validation"
            reasons.append("No reference duplicates, mismatches, or suspicious flags detected.")

        # Log AI advisory output to database
        ai_log = AIOutputLog(
            output_type="payment_validation_assist",
            source_reference=request.payment_id,
            version="v1.0",
            status=status,
            trace_id=request.trace_id or ""
        )
        db.add(ai_log)
        db.commit()

        return {
            "status": status,
            "severity": severity,
            "reasons": reasons,
            "ai_confidence": 0.98 if status == "Cleared for Manual Validation" else 0.90
        }
    except Exception as e:
        logger.error(f"Error in validation assist: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Validation assist failed: {str(e)}")


@router.get("/payment-validation-alerts")
def payment_validation_alerts(db: Session = Depends(get_db)):
    """
    Scans all pending payments and aggregates their AI checks and validation warnings.
    """
    try:
        foms = FomsClient()
        payments = foms.get_payments()
        
        # Pending payment statuses we want to scan
        pending_statuses = {"Pending Finance Validation", "Submitted", "Pending Validation"}
        pending_payments = [p for p in payments if p.get("status") in pending_statuses]
        
        alerts = []
        for p in pending_payments:
            ref = p.get("referenceNumber")
            ref_clean = ref.strip().upper() if ref else ""
            
            is_duplicate = False
            duplicate_payment_id = None
            
            if ref_clean:
                for op in payments:
                    if op.get("id") == p.get("id"):
                        continue
                    # Check if duplicated with a validated payment
                    if op.get("status") == "Validated":
                        refs = [op.get("referenceNumber"), op.get("payMongoReference"), op.get("speedPayReference")]
                        refs = [r.strip().upper() for r in refs if r]
                        if ref_clean in refs:
                            is_duplicate = True
                            duplicate_payment_id = op.get("id")
                            break
            
            if is_duplicate:
                alerts.append({
                    "payment_id": p.get("id"),
                    "invoice_no": p.get("invoiceNo"),
                    "amount": p.get("amount"),
                    "reference_number": ref,
                    "alert_type": "Duplicate Reference Detected",
                    "message": f"Payment '{p.get('id')}' reference '{ref}' is already validated in Payment '{duplicate_payment_id}'.",
                    "severity": "High"
                })
                
        return alerts
    except Exception as e:
        logger.error(f"Error aggregation validation alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Aggregation failed: {str(e)}")
