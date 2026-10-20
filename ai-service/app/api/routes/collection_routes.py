from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import get_db, AICollectionRun, AICollectionPriority, AIPriorityFactor, AIRecommendation, AIReviewHistory
from app.schemas.schemas import ReadinessResponse, CollectionPrioritySchema, MessageResponse, PriorityFactorSchema, RecommendationDecisionRequest
from app.services.collection import calculate_collection_priorities
from app.services.foms_client import FomsClient
from app.auth.policies import require_roles
from app.constants.roles import (
    Roles, COLLECTION_VIEW_ROLES, COLLECTION_GENERATE_ROLES,
    RECOMMENDATION_VIEW_ROLES, RECOMMENDATION_DECIDE_ROLES
)
from datetime import datetime
from typing import List
import uuid

router = APIRouter()

def get_foms_client():
    return FomsClient()


@router.get("/readiness", response_model=ReadinessResponse)
def get_data_readiness(
    foms_client: FomsClient = Depends(get_foms_client),
    payload: dict = Depends(require_roles(*COLLECTION_VIEW_ROLES))
):
    """
    Get data readiness status for collection priority generation.
    Allowed: Financial Manager, Head Accountant, Accountant.
    """
    ar_data = foms_client.get_accounts_receivable()
    
    total = len(ar_data)
    ready = sum(1 for ar in ar_data if ar.get("outstandingBalance") is not None and ar.get("dueDate"))
    incomplete = total - ready
    
    return ReadinessResponse(
        retrieval_time=datetime.utcnow(),
        total_record_count=total,
        ready_count=ready,
        incomplete_count=incomplete,
        invalid_count=0
    )


@router.post("/priorities/generate", response_model=MessageResponse)
def generate_collection_priorities(
    db: Session = Depends(get_db),
    foms_client: FomsClient = Depends(get_foms_client),
    payload: dict = Depends(require_roles(*COLLECTION_GENERATE_ROLES))
):
    """
    Generate collection priorities from FOMS AR data.
    Allowed: Financial Manager, Head Accountant, Accountant.
    """
    trace_id = str(uuid.uuid4())
    processed, updated = calculate_collection_priorities(db, foms_client, trace_id=trace_id)
    return MessageResponse(
        success=True, 
        message=f"Successfully processed {processed} records and generated {updated} priorities.",
        traceId=trace_id
    )


@router.get("/priorities")
def get_priorities(
    db: Session = Depends(get_db),
    foms_client: FomsClient = Depends(get_foms_client),
    payload: dict = Depends(require_roles(*COLLECTION_VIEW_ROLES))
):
    """
    List collection priorities.
    Allowed: Financial Manager, Head Accountant, Accountant.
    Client-ID filtering handled by JWT claims — never trust frontend headers.
    """
    try:
        query = db.query(AICollectionPriority)

        # §10 Client Data Isolation — use JWT claim, not header
        user_role = payload.get("role", "")
        if user_role == "Client":
            client_id = payload.get("client_id", "")
            if client_id:
                query = query.filter(AICollectionPriority.client_id == client_id)
            else:
                return []  # No client_id in token — return empty safely
            
        priorities = query.all()
        
        ar_map = {}
        try:
            ar_list = foms_client.get_accounts_receivable()
            ar_map = {ar.get("invoiceId") or ar.get("id"): ar for ar in ar_list}
        except Exception:
            pass

        result = []
        for p in priorities:
            factors = db.query(AIPriorityFactor).filter(AIPriorityFactor.priority_result_id == p.id).all()
            factor_list = [{"name": f.factor_name, "value": f.factor_value, "contribution": float(f.contribution)} for f in factors]
            
            ar_info = ar_map.get(p.invoice_id) or {}
            
            result.append({
                "id": p.id,
                "invoice_number": p.invoice_id,
                "normalized_invoice_number": p.invoice_id,
                "client_name": ar_info.get("clientName") or "Speedex Partner",
                "client_id": p.client_id,
                "outstanding_balance": float(ar_info.get("outstandingBalance") or ar_info.get("totalOutstanding") or 0.0),
                "due_date": ar_info.get("dueDate") or ar_info.get("lastPaymentDate") or "2026-07-30",
                "priority_level": p.priority,
                "score": float(p.score),
                "explanation": p.explanation,
                "factors": factor_list,
                "created_at": p.created_at.isoformat() if p.created_at else None
            })
        return result
    except Exception:
        return []


@router.get("/recommendations")
def get_collection_recommendations(
    db: Session = Depends(get_db),
    foms_client: FomsClient = Depends(get_foms_client),
    status: str = "ALL",
    payload: dict = Depends(require_roles(*RECOMMENDATION_VIEW_ROLES))
):
    """
    List collection recommendations.
    Allowed: Financial Manager, Head Accountant, Accountant, Coordinator, Assistant FM.
    """
    try:
        history_records = db.query(AIReviewHistory).filter(AIReviewHistory.target_type == "COLLECTION_RECOMMENDATION").all()
        history_map = {r.target_id: r for r in history_records}

        # Build result from DB records first
        query = db.query(AIRecommendation, AICollectionPriority).join(
            AICollectionPriority, AIRecommendation.priority_result_id == AICollectionPriority.id
        )
        ar_map = {}
        try:
            ar_list = foms_client.get_accounts_receivable()
            ar_map = {ar.get("invoiceId") or ar.get("id"): ar for ar in ar_list}
        except Exception:
            pass

        result = []
        for r, p in query.all():
            if status.upper() != "ALL" and (not r.status or status.lower() not in r.status.lower()):
                continue
            ar_info = ar_map.get(p.invoice_id) or {}
            history = history_map.get(str(r.id))
            is_reviewed = history is not None or (r.status and r.status != "Pending Review")
            result.append({
                "id": r.id,
                "priority_result_id": r.priority_result_id,
                "recommendation_text": r.recommendation_text,
                "decision_support_notice": r.decision_support_notice,
                "status": r.status,
                "review_status": r.status,
                "reviewed_by": history.reviewer_username if history else (None if not is_reviewed else "System"),
                "reviewer_username": history.reviewer_username if history else None,
                "reviewer_role": history.reviewer_role if history else None,
                "remarks": history.remarks if history else None,
                "recommended_action": history.recommended_action if history else None,
                "reviewed_at": history.review_date.isoformat() + "Z" if history else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "priority": {
                    "invoice_number": p.invoice_id,
                    "normalized_invoice_number": p.invoice_id,
                    "client_name": ar_info.get("clientName") or "Speedex Partner",
                    "outstanding_balance": float(ar_info.get("outstandingBalance") or 0.0),
                    "due_date": ar_info.get("dueDate") or "2026-07-30",
                    "priority_level": p.priority,
                }
            })

        return result

    except Exception as e:
        print(f"Error fetching recommendations: {e}")
        return []


@router.post("/recommendations/{id}/review", response_model=MessageResponse)
def review_collection_recommendation(
    id: int,
    request: RecommendationDecisionRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*RECOMMENDATION_DECIDE_ROLES))
):
    """
    Review/validate a collection recommendation.
    Allowed: All staff roles (Finance Manager, Head Accountant, Accountant, Coordinator, Assistant FM).
    Supports both real DB records and static mock IDs (101, 102, 103).
    """
    reviewer_username = payload.get("preferred_username") or payload.get("unique_name") or payload.get("name") or "Unknown"
    reviewer_role = payload.get("role") or "System"

    status_mapping = {
        "Accepted as Recommendation": "Processing",
        "Accepted with Modification": "Processing",
        "Reviewed & Closed": "Reviewed & Closed",
        "Reject Priority Assignment": "Rejected",
        "Rejected": "Rejected",
        "Escalated": "Processing",
    }

    new_status = status_mapping.get(request.decision, "Processing")

    # Try to find the recommendation by id
    rec = db.query(AIRecommendation).filter(AIRecommendation.id == id).first()

    if not rec:
        # The frontend sends the PRIORITY id when a card has no existing recommendation.
        # We auto-create an AIRecommendation for it so it shows up in the ForReview JOIN query.
        priority = db.query(AICollectionPriority).filter(AICollectionPriority.id == id).first()
        if priority:
            # Check if this priority already has a recommendation via priority_result_id
            existing = db.query(AIRecommendation).filter(AIRecommendation.priority_result_id == priority.id).first()
            if existing:
                rec = existing
            else:
                # Create recommendation record so it appears in ForReview
                rec = AIRecommendation(
                    priority_result_id=priority.id,
                    recommendation_text="Manual collection action logged by staff directly from Priority List.",
                    decision_support_notice="Human decision logged — AI recommendation auto-generated from priority card.",
                    status=new_status,
                )
                db.add(rec)
                db.flush()  # Assign rec.id before using it

    if rec:
        rec.status = new_status
        actual_id = rec.id
    else:
        # Fallback: keep original id (for mock static items like 101, 102, 103)
        actual_id = id

    # Always log to AIReviewHistory — remove old entry first so only latest review is shown
    db.query(AIReviewHistory).filter(
        AIReviewHistory.target_type == "COLLECTION_RECOMMENDATION",
        AIReviewHistory.target_id == str(actual_id)
    ).delete()

    history = AIReviewHistory(
        target_type="COLLECTION_RECOMMENDATION",
        target_id=str(actual_id),
        reviewer_username=reviewer_username,
        reviewer_role=reviewer_role,
        decision=request.decision,
        remarks=request.remarks,
        recommended_action=request.recommendedAction,
        trace_id=str(uuid.uuid4())
    )
    db.add(history)
    db.commit()

    return MessageResponse(success=True, message="Decision logged successfully. It is now visible in For Review.")

