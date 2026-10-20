import re
import logging
from typing import List, Dict, Tuple, Optional
from rapidfuzz import fuzz
from sqlalchemy.orm import Session
from app.models.database import AIDuplicateAlert, AIDuplicateMatch, AIOutputLog
from app.schemas.schemas import WaybillDuplicateRequest, InvoiceDuplicateRequest, OfficialReceiptDuplicateRequest, SpeedPayDuplicateRequest
from datetime import datetime
from app.core.normalizer import normalize_reference, normalize_invoice
from app.services.foms_client import FomsClient

logger = logging.getLogger(__name__)

def normalize_string(val: str) -> str:
    """
    Centralized canonical normalization wrapper
    """
    return normalize_reference(val)

def check_waybill_duplicate(db: Session, request: WaybillDuplicateRequest, foms_client: FomsClient) -> Optional[AIDuplicateAlert]:
    waybills = foms_client.get_waybills()
    req_norm = normalize_string(request.waybillNumber)
    
    best_similarity = 0.0
    best_match = None
    reason = ""

    for wb in waybills:
        num = wb.get("waybillNumber", "")
        norm = normalize_string(num)
        
        if req_norm == norm and req_norm != "":
            best_similarity = 100.0
            best_match = wb
            reason = f"Exact match found for normalized waybill number: {request.waybillNumber} and {num}."
            break
        else:
            score = fuzz.ratio(request.waybillNumber.upper(), num.upper())
            if score >= 90 and score > best_similarity:
                best_similarity = float(score)
                best_match = wb
                reason = f"Fuzzy match found for waybill numbers: {request.waybillNumber} and {num} with high similarity ({best_similarity}%)."

    if best_similarity >= 90 and best_match:
        alert = AIDuplicateAlert(
            alert_type="WAYBILL",
            source_record_id="REQ-WAYBILL", # Using a generic ID since this is an external request
            matched_record_id=best_match["waybillId"],
            confidence_score=best_similarity,
            severity="High" if best_similarity == 100 else "Medium",
            matched_fields={"waybillNumber": request.waybillNumber},
            match_reason=reason,
            status="Pending Review",
        )
        db.add(alert)
        db.flush()
        
        match_details = AIDuplicateMatch(
            alert_id=alert.id,
            source_details=request.dict(),
            match_details=best_match
        )
        db.add(match_details)
        db.commit()
        db.refresh(alert)
        return alert

    return None

def check_invoice_duplicate(db: Session, request: InvoiceDuplicateRequest, foms_client: FomsClient) -> Optional[AIDuplicateAlert]:
    invoices = foms_client.get_invoices()
    req_norm = normalize_string(request.invoiceNumber)
    
    best_similarity = 0.0
    best_match = None
    reason = ""
    matched_field = {}

    for inv in invoices:
        num = inv.get("invoiceNumber", "")
        norm = normalize_string(num)
        
        if req_norm == norm and req_norm != "":
            best_similarity = 100.0
            best_match = inv
            reason = f"Exact duplicate invoice number detected: {request.invoiceNumber} and {num}."
            matched_field = {"invoiceNumber": request.invoiceNumber}
            break
        
        score = fuzz.ratio(request.invoiceNumber.upper(), num.upper())
        if score >= 90 and score > best_similarity:
            best_similarity = float(score)
            best_match = inv
            reason = f"Highly similar invoice numbers: {request.invoiceNumber} and {num}."
            matched_field = {"invoiceNumber": request.invoiceNumber}
            
        if best_similarity < 90:
            if request.clientId == inv.get("clientId") and request.amount == inv.get("amount"):
                if request.waybillBasis and inv.get("waybillNumber"):
                    w_norm1 = normalize_string(request.waybillBasis)
                    w_norm2 = normalize_string(inv.get("waybillNumber"))
                    if w_norm1 == w_norm2:
                        best_similarity = 95.0
                        best_match = inv
                        reason = f"Invoices have matching client, identical amount (PHP {request.amount:,.2f}), and identical waybill association."
                        matched_field = {"amount": request.amount, "waybillBasis": request.waybillBasis, "clientId": request.clientId}

    if best_similarity >= 90 and best_match:
        alert = AIDuplicateAlert(
            alert_type="INVOICE",
            source_record_id="REQ-INVOICE",
            matched_record_id=best_match["invoiceId"],
            confidence_score=best_similarity,
            severity="High" if best_similarity == 100 else "Medium",
            matched_fields=matched_field,
            match_reason=reason,
            status="Pending Review",
        )
        db.add(alert)
        db.flush()
        
        match_details = AIDuplicateMatch(
            alert_id=alert.id,
            source_details=request.dict(),
            match_details=best_match
        )
        db.add(match_details)
        db.commit()
        db.refresh(alert)
        return alert

    return None

def check_receipt_duplicate(db: Session, request: OfficialReceiptDuplicateRequest, foms_client: FomsClient) -> Optional[AIDuplicateAlert]:
    receipts = foms_client.get_official_receipts()
    req_norm = normalize_string(request.receiptNumber)
    
    for rec in receipts:
        num = rec.get("orNumber", "")
        norm = normalize_string(num)
        
        if req_norm == norm and req_norm != "":
            alert = AIDuplicateAlert(
                alert_type="OFFICIAL_RECEIPT",
                source_record_id="REQ-RECEIPT",
                matched_record_id=rec["orId"],
                confidence_score=100.0,
                severity="High",
                matched_fields={"orNumber": request.receiptNumber},
                match_reason=f"Duplicate Official Receipt number detected: {request.receiptNumber} and {num}.",
                status="Pending Review",
            )
            db.add(alert)
            db.flush()
            
            match_details = AIDuplicateMatch(
                alert_id=alert.id,
                source_details=request.dict(),
                match_details=rec
            )
            db.add(match_details)
            db.commit()
            db.refresh(alert)
            return alert

    return None

def check_speedpay_duplicate(db: Session, request: SpeedPayDuplicateRequest, foms_client: FomsClient) -> Optional[AIDuplicateAlert]:
    speedpay = foms_client.get_speedpay_submissions()
    req_norm = normalize_string(request.referenceNumber)
    
    for sp in speedpay:
        ref = sp.get("referenceNumber", "")
        norm = normalize_string(ref)
        
        if req_norm == norm and req_norm != "":
            alert = AIDuplicateAlert(
                alert_type="SPEEDPAY_REFERENCE",
                source_record_id="REQ-SPEEDPAY",
                matched_record_id=sp["submissionId"],
                confidence_score=100.0,
                severity="High",
                matched_fields={"referenceNumber": request.referenceNumber},
                match_reason=f"Duplicate SpeedPay payment reference number detected: {request.referenceNumber} and {ref}.",
                status="Pending Review",
            )
            db.add(alert)
            db.flush()
            
            match_details = AIDuplicateMatch(
                alert_id=alert.id,
                source_details=request.dict(),
                match_details=sp
            )
            db.add(match_details)
            db.commit()
            db.refresh(alert)
            return alert

    return None

def process_scanned_document(db: Session, file_bytes: bytes, filename: str, mime_type: str = "image/jpeg", user_id: str = "SYSTEM") -> Dict:
    """
    Process document image using Gemini 2.5 Flash for OCR extraction and RapidFuzz for duplicate checking.

    VALIDATION GATE: Document must be classified as a valid financial document before
    duplicate detection runs. Random images, personal photos, and non-financial documents
    are rejected here and do NOT proceed to duplicate matching.
    """
    from app.services.ocr_service import extract_document_fields, VALID_FINANCE_DOC_TYPES, INVALID_DOC_TYPES
    from app.models.database import AIScanLog
    import uuid

    # ── Step 1: AI Document Classification via Gemini ─────────────────────────
    extracted = extract_document_fields(file_bytes, filename, mime_type)

    doc_type = extracted.get("documentType", "INVALID_OR_UNRELATED_IMAGE")
    is_allowed = extracted.get("isAllowed", False)
    confidence = float(extracted.get("confidence", 0.0))
    gemini_unavailable = extracted.get("geminiUnavailable", False)
    should_proceed = extracted.get("shouldProceedToDuplicateScan", False)

    # ── Step 2: Validation Gate — stop here if document is not a finance doc ──
    CONFIDENCE_THRESHOLD = 0.75

    is_explicitly_invalid = (
        gemini_unavailable
        or not is_allowed
        or not should_proceed
        or doc_type in INVALID_DOC_TYPES
        or doc_type == "NEEDS_GEMINI_REVIEW"
        or (doc_type not in VALID_FINANCE_DOC_TYPES and doc_type != "NEEDS_GEMINI_REVIEW")
        or (confidence > 0 and confidence < CONFIDENCE_THRESHOLD)
    )

    reason_code = "UNKNOWN"
    user_message = ""

    if is_explicitly_invalid:
        if gemini_unavailable:
            reason_code = "GEMINI_UNAVAILABLE"
            user_message = (
                "AI document classification is temporarily unavailable. "
                "The duplicate scan has been stopped to prevent false results. "
                "Please try again in a few minutes."
            )
        elif doc_type in INVALID_DOC_TYPES or not is_allowed:
            reason_code = "INVALID_DOCUMENT"
            user_message = (
                "Only official receipts, invoices, billing statements, or payment-related finance documents are allowed."
            )
        elif confidence > 0 and confidence < CONFIDENCE_THRESHOLD:
            reason_code = "LOW_CONFIDENCE"
            user_message = (
                f"AI confidence ({confidence:.0%}) is below the required threshold. "
                "The document could not be reliably classified. "
                "Please upload a clearer image of the financial document."
            )
        else:
            reason_code = "UNRECOGNIZED_DOCUMENT_TYPE"
            user_message = (
                "The uploaded file does not appear to be a supported financial document. "
                "Accepted types: Official Receipt, Invoice, Billing Statement, Waybill, Proof of Payment."
            )

        logger.info(
            f"[SCAN] Document rejected: type={doc_type} allowed={is_allowed} "
            f"confidence={confidence:.2f} reason={reason_code} file={filename}"
        )

        # Log invalid upload attempts for audit and debugging
        scan_log = AIScanLog(
            user_id=user_id,
            uploaded_file_name=filename,
            detected_document_type=doc_type,
            is_allowed=False,
            validation_status="INVALID_DOCUMENT",
            reason=extracted.get("reason", user_message)
        )
        db.add(scan_log)
        db.commit()

        return {
            "status": "INVALID_DOCUMENT",
            "isAllowed": False,
            "reason_code": reason_code,
            "message": user_message,
            "extracted": extracted,
            "duplicate": False,
            "confidence": confidence,
        }

    # Log successful validation
    scan_log = AIScanLog(
        user_id=user_id,
        uploaded_file_name=filename,
        detected_document_type=doc_type,
        is_allowed=True,
        validation_status="VALID_DOCUMENT",
        reason="Document successfully validated as financial document."
    )
    db.add(scan_log)
    db.commit()

    detected_fields = extracted.get("detectedFields", {})
    doc_num = detected_fields.get("invoiceNumber") or detected_fields.get("officialReceiptNumber") or f"DOC-{uuid.uuid4().hex[:6].upper()}"
    client_name = detected_fields.get("clientName", "Unknown Client")
    amount = detected_fields.get("amount", "0.00")
    tx_date = detected_fields.get("dateIssued", datetime.utcnow().strftime("%Y-%m-%d"))
    ref = detected_fields.get("paymentReference") or f"REF-{doc_num}"
    
    # We still need to construct the extracted object format that RapidFuzz uses below
    mapped_extracted = {
        "documentType": doc_type,
        "documentNumber": doc_num,
        "clientName": client_name,
        "amount": amount,
        "transactionDate": tx_date,
        "referenceNumber": ref,
        "is_valid": True # keep this for any other legacy logic
    }



    # 2. RapidFuzz check against existing matches in PostgreSQL
    existing_matches = db.query(AIDuplicateMatch).all()
    
    highest_score = 0.0
    matched_record = None
    reason = "No matching document found."

    req_norm = normalize_string(doc_num)

    for record in existing_matches:
        source = record.source_details or {}
        existing_num = source.get("documentNumber") or source.get("receiptNumber") or source.get("invoiceNumber") or source.get("waybillNumber") or ""
        existing_client = source.get("clientName") or ""
        
        ex_norm = normalize_string(existing_num)

        if req_norm and ex_norm and req_norm == ex_norm:
            highest_score = 100.0
            matched_record = record
            reason = f"Exact match detected for document number: {doc_num}"
            break

        if doc_num and existing_num:
            score_num = fuzz.ratio(doc_num.upper(), existing_num.upper())
            score_client = fuzz.token_sort_ratio(client_name.upper(), existing_client.upper()) if existing_client else 0
            
            combined_score = (score_num * 0.7) + (score_client * 0.3)
            if combined_score > highest_score:
                highest_score = combined_score
                matched_record = record
                reason = f"Fuzzy match detected ({highest_score:.1f}%) with document {existing_num}"

    is_duplicate = highest_score >= 85.0

    if is_duplicate:
        # Create AIDuplicateAlert in PostgreSQL
        alert = AIDuplicateAlert(
            alert_type=doc_type,
            source_record_id=f"SCAN-{uuid.uuid4().hex[:8].upper()}",
            matched_record_id=str(matched_record.id) if matched_record else "EXISTING-RECORD",
            confidence_score=highest_score,
            severity="High" if highest_score >= 95 else "Medium",
            matched_fields={"documentNumber": doc_num, "clientName": client_name, "amount": amount},
            match_reason=reason,
            status="Pending Review"
        )
        db.add(alert)
        db.flush()

        match_details = AIDuplicateMatch(
            alert_id=alert.id,
            source_details=mapped_extracted,
            match_details=matched_record.source_details if matched_record else {"status": "FLAGGED_DUPLICATE"}
        )
        db.add(match_details)
        db.commit()

        matched_record_payload = None
        if matched_record and matched_record.source_details:
            source = matched_record.source_details or {}
            matched_amount = source.get("amount") or amount
            matched_record_payload = {
                "record_id": str(matched_record.id),
                "documentNumber": source.get("documentNumber") or source.get("receiptNumber") or source.get("invoiceNumber") or source.get("waybillNumber") or doc_num,
                "clientName": source.get("clientName") or client_name or "Customer Name Not Read",
                "amount": str(matched_amount) if matched_amount is not None else "Missing",
                "transactionDate": source.get("transactionDate") or tx_date,
                "referenceNumber": source.get("referenceNumber") or ref,
                "waybillNumber": source.get("waybillNumber") or ""
            }

        return {
            "status": "FLAGGED_DUPLICATE",
            "alert_id": alert.id,
            "confidence_score": highest_score,
            "extracted": mapped_extracted,
            "matched_record": matched_record_payload,
            "reason": reason,
            "message": f"Duplicate detected ({highest_score:.1f}% similarity). Document flagged for review."
        }
    else:
        # Store as Unique Document in PostgreSQL
        match_details = AIDuplicateMatch(
            alert_id=None,
            source_details=mapped_extracted,
            match_details={"status": "UNIQUE_DOCUMENT", "cleared_at": datetime.utcnow().isoformat()}
        )
        db.add(match_details)
        db.commit()

        return {
            "status": "UNIQUE_DOCUMENT",
            "match_id": match_details.id,
            "confidence_score": highest_score,
            "extracted": mapped_extracted,
            "reason": "No duplicate detected. Cleared for FOMS normal validation.",
            "message": "Document scanned and cataloged as Unique Document."
        }

