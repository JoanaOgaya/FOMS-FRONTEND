from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import get_db, AIRecommendation, AIRecommendationDecision, AICollectionPriority
from app.schemas.schemas import RecommendationDashboardSummary, RecommendationDecisionRequest, MessageResponse
from app.auth.policies import require_roles
from app.constants.roles import (
    Roles, RECOMMENDATION_VIEW_ROLES, RECOMMENDATION_DECIDE_ROLES,
    EXPORT_ROLES, AUDIT_VIEW_ROLES
)
from typing import List, Optional
import uuid

router = APIRouter()


@router.get("/summary", response_model=RecommendationDashboardSummary)
def get_recommendation_summary(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*RECOMMENDATION_VIEW_ROLES))
):
    """
    Get recommendation dashboard summary.
    Allowed: Financial Manager, Head Accountant, Accountant.
    """
    recs = db.query(AIRecommendation).all()
    
    total = len(recs)
    pending = sum(1 for r in recs if r.status == "Pending Review")
    
    high_count = 0
    med_count = 0
    low_count = 0
    outstanding = 0.0
    
    approved = 0
    rejected = 0
    
    for r in recs:
        p = db.query(AICollectionPriority).filter(AICollectionPriority.id == r.priority_result_id).first()
        if p:
            if p.priority == "HIGH":
                high_count += 1
            elif p.priority == "MEDIUM":
                med_count += 1
            elif p.priority == "LOW":
                low_count += 1
            
        if r.status.startswith("Reviewed - APPROVED"):
            approved += 1
        elif r.status.startswith("Reviewed - REJECTED"):
            rejected += 1

    return RecommendationDashboardSummary(
        total_recommendations=total,
        high_priority_count=high_count,
        medium_priority_count=med_count,
        low_priority_count=low_count,
        total_outstanding_amount=outstanding,
        pending_validation_count=pending,
        approved_count=approved,
        rejected_count=rejected,
        priority_distribution={
            "HIGH": high_count,
            "MEDIUM": med_count,
            "LOW": low_count
        }
    )


@router.get("")
def get_recommendations(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*RECOMMENDATION_VIEW_ROLES))
):
    """
    List recommendations.
    Allowed: Financial Manager, Head Accountant, Accountant.
    """
    recs = db.query(AIRecommendation).all()
    return [{"id": r.id, "text": r.recommendation_text, "status": r.status, "created_at": r.created_at} for r in recs]


@router.get("/export")
def export_recommendations(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*EXPORT_ROLES))
):
    """
    Export recommendations report.
    Allowed: Financial Manager only.
    """
    return {"exportUrl": "https://foms-storage/exports/recommendations.csv"}


@router.post("/{id}/decision", response_model=MessageResponse)
def make_recommendation_decision(
    id: int,
    request: RecommendationDecisionRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*RECOMMENDATION_DECIDE_ROLES))
):
    """
    Make a decision on a recommendation.
    Allowed: Financial Manager, Head Accountant only.
    Uses JWT claims for identity — never trusts frontend headers (§9).
    """
    rec = db.query(AIRecommendation).filter(AIRecommendation.id == id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
        
    if request.decision not in ["APPROVED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Invalid decision.")

    # Use JWT claims for identity — §9 Resource-Level Auth
    decided_by = payload.get("name", payload.get("sub", "System"))
    decided_role = payload.get("role", "AI Service")
        
    decision_rec = AIRecommendationDecision(
        recommendation_id=id,
        decision=request.decision,
        remarks=request.remarks,
        decided_by=decided_by,
        decided_role=decided_role,
        trace_id=str(uuid.uuid4())
    )
    db.add(decision_rec)
    
    rec.status = f"Reviewed - {request.decision}"
    db.commit()
    
    return MessageResponse(success=True, message=f"Recommendation {id} {request.decision.lower()} successfully.")


@router.get("/{id}/history")
def get_recommendation_history(
    id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*AUDIT_VIEW_ROLES))
):
    """
    Get recommendation decision history.
    Allowed: Financial Manager, Head Accountant, Accountant, Assistant FM.
    """
    history = db.query(AIRecommendationDecision).filter(AIRecommendationDecision.recommendation_id == id).all()
    return history

