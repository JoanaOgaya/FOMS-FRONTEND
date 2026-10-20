import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, status, Request
from sqlalchemy.orm import Session
from app.models.database import (
    get_db, AIDuplicateAlert, AIDuplicateReview, AIUniqueDocument, AIReviewHistory
)
from app.schemas.schemas import (
    WaybillDuplicateRequest, InvoiceDuplicateRequest, OfficialReceiptDuplicateRequest, 
    SpeedPayDuplicateRequest, DuplicateAlertSchema, MessageResponse, DuplicateReviewRequest,
    UniqueDocumentCreateRequest, ReviewHistoryCreateRequest
)
from app.services.duplicate_check import (
    check_waybill_duplicate, check_invoice_duplicate, 
    check_receipt_duplicate, check_speedpay_duplicate,
    process_scanned_document
)
from app.services.foms_client import FomsClient
from app.auth.policies import require_roles
from app.constants.roles import (
    Roles, DUPLICATE_CHECK_ROLES, DUPLICATE_REVIEW_ROLES, DOCUMENT_SCAN_ROLES
)
from app.core.rate_limit import limiter
from typing import List, Optional

logger = logging.getLogger(__name__)

router = APIRouter()

# ── §19 File-Upload Security Constants ───────────────────────────────────
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
}
# Magic byte signatures for file type validation
FILE_SIGNATURES = {
    b"\x25\x50\x44\x46": "application/pdf",        # %PDF
    b"\xff\xd8\xff": "image/jpeg",                  # JPEG/JPG
    b"\x89\x50\x4e\x47\x0d\x0a\x1a\x0a": "image/png",  # PNG
}
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
DANGEROUS_EXTENSIONS = {".exe", ".bat", ".cmd", ".dll", ".zip", ".rar", ".sh", ".ps1", ".js", ".vbs"}


def _validate_upload(file: UploadFile, file_bytes: bytes) -> None:
    """
    Validate uploaded file per §19 File-Upload Security.
    Checks: extension, MIME type, magic bytes, size, empty, dangerous, filename safety.
    Raises HTTPException on any failure.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required."
        )

    # Sanitise filename — strip path separators
    safe_name = os.path.basename(file.filename).strip()
    if not safe_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename."
        )

    # Extension check
    ext = os.path.splitext(safe_name)[1].lower()
    if ext in DANGEROUS_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{ext}' is not allowed. Executable and archive files are rejected."
        )
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File extension '{ext}' is not supported. Allowed: PDF, JPG, JPEG, PNG."
        )

    # MIME type check
    if file.content_type and file.content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"MIME type '{file.content_type}' is not supported. Allowed: {', '.join(ALLOWED_MIME_TYPES)}."
        )

    # Empty file check
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    # Size check
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the maximum allowed ({MAX_UPLOAD_SIZE_BYTES // (1024*1024)} MB)."
        )

    # Magic bytes signature check
    signature_valid = False
    for sig, mime in FILE_SIGNATURES.items():
        if file_bytes[:len(sig)] == sig:
            signature_valid = True
            break
    if not signature_valid:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File content does not match a supported file type. The file may be corrupted or disguised."
        )


def get_foms_client():
    return FomsClient()


# ── Waybill Duplicate Check ─────────────────────────────────────────────
@router.post("/waybill", response_model=MessageResponse)
def duplicate_waybill_check(
    request: WaybillDuplicateRequest, 
    db: Session = Depends(get_db),
    foms_client: FomsClient = Depends(get_foms_client),
    payload: dict = Depends(require_roles(*DUPLICATE_CHECK_ROLES))
):
    """Allowed: Financial Manager, Head Accountant, Accountant, Coordinator."""
    alert = check_waybill_duplicate(db, request, foms_client)
    if alert:
        return MessageResponse(success=True, message="Potential duplicate waybill detected.", data={"alert_id": alert.id})
    return MessageResponse(success=True, message="No duplicates found.")


# ── Invoice Duplicate Check ─────────────────────────────────────────────
@router.post("/invoice", response_model=MessageResponse)
def duplicate_invoice_check(
    request: InvoiceDuplicateRequest, 
    db: Session = Depends(get_db),
    foms_client: FomsClient = Depends(get_foms_client),
    payload: dict = Depends(require_roles(*DUPLICATE_REVIEW_ROLES))
):
    """Allowed: Financial Manager, Head Accountant, Accountant."""
    alert = check_invoice_duplicate(db, request, foms_client)
    if alert:
        return MessageResponse(success=True, message="Potential duplicate invoice detected.", data={"alert_id": alert.id})
    return MessageResponse(success=True, message="No duplicates found.")


# ── Official Receipt Duplicate Check ─────────────────────────────────────
@router.post("/official-receipt", response_model=MessageResponse)
def duplicate_receipt_check(
    request: OfficialReceiptDuplicateRequest, 
    db: Session = Depends(get_db),
    foms_client: FomsClient = Depends(get_foms_client),
    payload: dict = Depends(require_roles(*DUPLICATE_REVIEW_ROLES))
):
    """Allowed: Financial Manager, Head Accountant, Accountant."""
    alert = check_receipt_duplicate(db, request, foms_client)
    if alert:
        return MessageResponse(success=True, message="Potential duplicate official receipt detected.", data={"alert_id": alert.id})
    return MessageResponse(success=True, message="No duplicates found.")


# ── SpeedPay Duplicate Check ────────────────────────────────────────────
@router.post("/speedpay", response_model=MessageResponse)
def duplicate_speedpay_check(
    request: SpeedPayDuplicateRequest, 
    db: Session = Depends(get_db),
    foms_client: FomsClient = Depends(get_foms_client),
    payload: dict = Depends(require_roles(*DUPLICATE_REVIEW_ROLES))
):
    """Allowed: Financial Manager, Head Accountant, Accountant."""
    alert = check_speedpay_duplicate(db, request, foms_client)
    if alert:
        return MessageResponse(success=True, message="Potential duplicate speedpay submission detected.", data={"alert_id": alert.id})
    return MessageResponse(success=True, message="No duplicates found.")


# ── Review Duplicate Alert ───────────────────────────────────────────────
@router.post("/{alertId}/review", response_model=MessageResponse)
@limiter.limit("30/minute")
def review_duplicate_alert(
    alertId: int,
    request: Request,
    body: DuplicateReviewRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DUPLICATE_REVIEW_ROLES))
):
    """
    Review a duplicate alert. Allowed: Financial Manager, Head Accountant, Accountant.
    Uses JWT claims for reviewer identity — never trusts frontend headers.
    """
    if body.decision not in ["CANCEL", "REVISE", "PROCEED"]:
        raise HTTPException(status_code=400, detail="Invalid decision. Must be CANCEL, REVISE, or PROCEED.")
        
    if body.decision == "PROCEED" and not body.justification:
        raise HTTPException(status_code=400, detail="Justification is required for PROCEED decision.")

    alert = db.query(AIDuplicateAlert).filter(AIDuplicateAlert.id == alertId).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    # Use JWT claims for identity — §9 Resource-Level Auth
    reviewer_name = payload.get("name", payload.get("sub", "System"))
    reviewer_role = payload.get("role", "AI Service")

    review = AIDuplicateReview(
        alert_id=alertId,
        decision=body.decision,
        justification=body.justification,
        reviewed_by=reviewer_name,
        reviewed_role=reviewer_role,
        trace_id=str(uuid.uuid4())
    )
    db.add(review)
    
    alert.status = f"Reviewed - {body.decision}"
    db.commit()
    
    return MessageResponse(success=True, message=f"Alert {alertId} reviewed successfully.")

# ── Document Validation Only ────────────────────────────────
@router.post("/validate")
@limiter.limit("20/minute")
async def validate_document(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DOCUMENT_SCAN_ROLES))
):
    """
    Validate whether the uploaded file is an allowed financial document before running duplicate scan.
    Returns:
      Valid: {"isAllowed": true, "documentType": "...", "confidence": 0.94, "reason": "..."}
      Invalid: {"isAllowed": false, "documentType": "...", "confidence": 0.98, "reason": "...", "message": "..."}
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    file_bytes = await file.read()
    _validate_upload(file, file_bytes)

    from app.services.ocr_service import extract_document_fields, VALID_FINANCE_DOC_TYPES, INVALID_DOC_TYPES
    from app.models.database import AIScanLog
    from fastapi.responses import JSONResponse

    extracted = extract_document_fields(file_bytes, file.filename, file.content_type)
    doc_type = extracted.get("documentType", "INVALID_OR_UNRELATED_IMAGE")
    is_allowed = extracted.get("isAllowed", False)
    confidence = float(extracted.get("confidence", 0.0))
    reason = extracted.get("reason", "")
    user_id = payload.get("sub", "SYSTEM")

    if not is_allowed or doc_type in INVALID_DOC_TYPES or doc_type not in VALID_FINANCE_DOC_TYPES or confidence < 0.75:
        # Log invalid upload
        scan_log = AIScanLog(
            user_id=user_id,
            uploaded_file_name=file.filename,
            detected_document_type=doc_type,
            is_allowed=False,
            validation_status="INVALID_DOCUMENT",
            reason=reason or "Uploaded file does not contain invoice, official receipt, payment, or billing fields."
        )
        db.add(scan_log)
        db.commit()

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "isAllowed": False,
                "documentType": doc_type,
                "confidence": confidence,
                "reason": reason or "The image appears to be a personal photo and does not contain invoice, official receipt, payment, or billing fields.",
                "message": "Only invoices, official receipts, and payment-related documents are allowed."
            }
        )

    # Log valid upload
    scan_log = AIScanLog(
        user_id=user_id,
        uploaded_file_name=file.filename,
        detected_document_type=doc_type,
        is_allowed=True,
        validation_status="VALID_DOCUMENT",
        reason=reason or "Detected official receipt layout, receipt number, amount, and company header."
    )
    db.add(scan_log)
    db.commit()

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "isAllowed": True,
            "documentType": doc_type,
            "confidence": confidence,
            "reason": reason or "Detected official receipt layout, receipt number, amount, and company header."
        }
    )


# ── Document Scan (OCR + Duplicate Check) ────────────────────────────────
@router.post("/scan")
@limiter.limit("10/minute")
async def scan_document(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DOCUMENT_SCAN_ROLES))
):
    """
    Scan a financial document image:
    1. Validate file extension and MIME type.
    2. Classify document type.
    3. If invalid -> return HTTP 422 with status INVALID_DOCUMENT.
    4. If valid -> Extract fields, check RapidFuzz duplicates, return HTTP 200.
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    file_bytes = await file.read()

    # §19 File-Upload Security validation
    _validate_upload(file, file_bytes)

    result = process_scanned_document(db, file_bytes, file.filename, file.content_type, user_id=payload.get("sub", "SYSTEM"))

    # When the document is invalid, return HTTP 422 (Unprocessable Entity)
    if result.get("status") == "INVALID_DOCUMENT":
        extracted_info = result.get("extracted", {})
        det_type = extracted_info.get("documentType", "INVALID_OR_UNRELATED_IMAGE")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "status": "INVALID_DOCUMENT",
                "message": result.get("message", "Only official receipts, invoices, billing statements, or payment-related finance documents are allowed."),
                "details": {
                    "detectedType": det_type,
                    "reason": extracted_info.get("reason") or "The uploaded image does not contain finance document fields.",
                    "confidence": result.get("confidence", 0.0)
                }
            }
        )

    # Valid response
    from fastapi.responses import JSONResponse
    extracted_data = result.get("extracted", {})
    doc_type = extracted_data.get("documentType", "OFFICIAL_RECEIPT")
    doc_num = extracted_data.get("documentNumber")
    amt = extracted_data.get("amount")
    tx_date = extracted_data.get("transactionDate")
    matched_rec = result.get("matched_record")
    is_dup = result.get("status") == "FLAGGED_DUPLICATE"

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "status": "DUPLICATE_FOUND" if is_dup else "UNIQUE_DOCUMENT",
            "documentType": doc_type,
            "extractedFields": {
                "officialReceiptNumber": doc_num if doc_type in ("OFFICIAL_RECEIPT", "PAYMENT_RECEIPT") else None,
                "invoiceNumber": doc_num if doc_type == "INVOICE" else None,
                "amount": amt,
                "dateIssued": tx_date
            },
            "duplicateResult": {
                "isDuplicate": is_dup,
                "matchScore": round(float(result.get("confidence_score", 0.0)) / 100.0, 2) if is_dup else 0.0,
                "matchedRecordId": matched_rec.get("record_id") if (is_dup and matched_rec) else None
            },
            "data": result,
            "message": result.get("message")
        }
    )


# ── Get All Duplicate Alerts ────────────────────────────────────────────
@router.get("")
def get_duplicate_alerts(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DUPLICATE_CHECK_ROLES))
):
    """
    List all duplicate alerts.
    Allowed: Financial Manager, Head Accountant, Accountant, Coordinator.
    """
    try:
        alerts = db.query(AIDuplicateAlert).all()
        result = []
        for a in alerts:
            result.append({
                "id": a.id,
                "alert_type": a.alert_type,
                "source_record_id": a.source_record_id,
                "matched_record_id": a.matched_record_id,
                "confidence_score": float(a.confidence_score) if a.confidence_score else 0.0,
                "severity": a.severity,
                "matched_fields": a.matched_fields,
                "match_reason": a.match_reason,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "output_version": a.output_version,
                "trace_id": a.trace_id
            })
        return result
    except Exception:
        return []


# ── Unique Documents Persistence Endpoints ──────────────────────────────
@router.get("/unique-documents")
def get_unique_documents(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DUPLICATE_CHECK_ROLES))
):
    """
    Get all cataloged unique documents from PostgreSQL.
    """
    try:
        from app.models.database import AIUniqueDocument
        uniques = db.query(AIUniqueDocument).order_by(AIUniqueDocument.created_at.desc()).all()
        result = []
        for u in uniques:
            result.append({
                "id": f"REC-UNI-{u.id:04d}",
                "documentType": u.document_type,
                "documentNumber": u.document_number,
                "clientName": u.client_name,
                "amount": str(u.amount) if u.amount is not None else "0.00",
                "transactionDate": u.transaction_date,
                "referenceNumber": u.reference_number,
                "waybillNumber": u.waybill_number,
                "sourceType": u.source_type,
                "scannedBy": u.scanned_by,
                "scannedRole": u.scanned_role,
                "aiResult": u.ai_result,
                "similarityScore": float(u.similarity_score) if u.similarity_score else 0.0,
                "createdAt": u.created_at.isoformat() if u.created_at else None
            })
        return result
    except Exception as e:
        logger.error(f"Error fetching unique documents: {e}")
        return []

@router.post("/save-unique")
def save_unique_document(
    body: UniqueDocumentCreateRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DOCUMENT_SCAN_ROLES))
):
    """
    Persist a unique document record to PostgreSQL.
    """
    try:
        from app.models.database import AIUniqueDocument
        username = payload.get("name", payload.get("sub", "System"))
        role = payload.get("role", "Staff")

        rec = AIUniqueDocument(
            document_type=body.documentType,
            document_number=body.documentNumber,
            client_name=body.clientName,
            amount=body.amount,
            transaction_date=body.transactionDate,
            reference_number=body.referenceNumber,
            waybill_number=body.waybillNumber,
            source_type=body.sourceType or "Uploaded",
            scanned_by=body.scannedBy or username,
            scanned_role=body.scannedRole or role,
            ai_result=body.aiResult or "No Duplicate Detected",
            similarity_score=body.similarityScore or 0.0,
            trace_id=str(uuid.uuid4())
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)

        return MessageResponse(
            success=True,
            message="Unique document saved to PostgreSQL.",
            data={"id": f"REC-UNI-{rec.id:04d}"}
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save unique document: {str(e)}")

# ── Review History Persistence Endpoints ─────────────────────────────────
@router.get("/review-history")
def get_review_history_records(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DUPLICATE_CHECK_ROLES))
):
    """
    List all review history entries from PostgreSQL ai_review_history table.
    """
    try:
        from app.models.database import AIReviewHistory
        reviews = db.query(AIReviewHistory).order_by(AIReviewHistory.review_date.desc()).all()
        result = []
        for r in reviews:
            result.append({
                "id": str(r.id),
                "target_type": r.target_type,
                "target_id": r.target_id,
                "reviewer_username": r.reviewer_username,
                "reviewer_role": r.reviewer_role,
                "decision": r.decision,
                "remarks": r.remarks,
                "recommended_action": r.recommended_action,
                "review_date": r.review_date.isoformat() if r.review_date else None
            })
        return result
    except Exception as e:
        logger.error(f"Error fetching review history: {e}")
        return []

@router.post("/review-history")
def add_review_history_record(
    body: ReviewHistoryCreateRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DUPLICATE_REVIEW_ROLES))
):
    """
    Add a review history record to PostgreSQL ai_review_history table.
    """
    try:
        from app.models.database import AIReviewHistory
        username = payload.get("name", payload.get("sub", "System"))
        role = payload.get("role", "Reviewer")

        entry = AIReviewHistory(
            target_type=body.targetType or "DUPLICATE_ALERT",
            target_id=body.targetId,
            reviewer_username=body.reviewerUsername or username,
            reviewer_role=body.reviewerRole or role,
            decision=body.decision,
            remarks=body.remarks,
            recommended_action=body.recommendedAction,
            trace_id=str(uuid.uuid4())
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)

        return MessageResponse(
            success=True,
            message="Review history recorded.",
            data={"id": entry.id}
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record review history: {str(e)}")

