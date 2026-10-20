from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case
from app.models.database import (
    get_db,
    AIDuplicateAlert,
    AIDuplicateReview,
    AIAuditEvent,
    AICollectionPriority,
    AICollectionRun,
    AIRecommendation,
    AIReviewHistory,
    AIUniqueDocument,
    AIScanLog,
)
from app.auth.policies import require_roles
from app.constants.roles import (
    Roles, DASHBOARD_FULL_ROLES, DASHBOARD_ALL_ROLES, AUDIT_VIEW_ROLES
)
from app.services.foms_client import FomsClient
from datetime import datetime, timedelta
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _time_ago(dt: datetime) -> str:
    """Convert a datetime to a human-readable 'time ago' string."""
    if not dt:
        return "unknown"
    now = datetime.utcnow()
    diff = now - dt
    if diff.seconds < 60:
        return "just now"
    elif diff.seconds < 3600:
        mins = diff.seconds // 60
        return f"{mins}m ago"
    elif diff.days == 0:
        hrs = diff.seconds // 3600
        return f"{hrs}h ago"
    else:
        return f"{diff.days}d ago"


# ── Dashboard Summary (Real DB Queries) ─────────────────────────────────────
@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DASHBOARD_ALL_ROLES))
):
    """
    Get aggregated metrics for the AI Intelligence Dashboard.
    Queries PostgreSQL DB for real alert counts, returning zeroes if empty.
    Allowed: Financial Manager, Head Accountant, Accountant, Coordinator (limited), Assistant FM (limited).
    """
    try:
        # Total duplicate alerts (all statuses)
        total_duplicate_alerts = db.query(func.count(AIDuplicateAlert.id)).scalar() or 0

        # Pending duplicate reviews
        pending_reviews = (
            db.query(func.count(AIDuplicateAlert.id))
            .filter(AIDuplicateAlert.status == "Pending Review")
            .scalar()
        ) or 0

        # Exact match alerts (alert_type = 'EXACT_MATCH' or confidence_score = 100)
        exact_match_alerts = (
            db.query(func.count(AIDuplicateAlert.id))
            .filter(
                (AIDuplicateAlert.alert_type == "EXACT_MATCH") |
                (AIDuplicateAlert.confidence_score >= 100)
            )
            .scalar()
        ) or 0

        # Urgent collection accounts — priorities with 'Urgent' level
        urgent_collection_accounts = (
            db.query(func.count(AICollectionPriority.id))
            .filter(AICollectionPriority.priority == "Urgent")
            .scalar()
        ) or 0

        # Recommendations awaiting validation (status = 'Pending Review')
        recommendations_awaiting = (
            db.query(func.count(AIRecommendation.id))
            .filter(AIRecommendation.status == "Pending Review")
            .scalar()
        ) or 0

        return {
            "totalDuplicateAlerts": total_duplicate_alerts,
            "pendingDuplicateReviews": pending_reviews,
            "exactMatchAlerts": exact_match_alerts,
            "urgentCollectionAccounts": urgent_collection_accounts,
            "recommendationsAwaitingValidation": recommendations_awaiting,
            "lastUpdatedAt": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error fetching dashboard summary: {e}")
        return {
            "totalDuplicateAlerts": 0,
            "pendingDuplicateReviews": 0,
            "exactMatchAlerts": 0,
            "urgentCollectionAccounts": 0,
            "recommendationsAwaitingValidation": 0,
            "lastUpdatedAt": datetime.utcnow().isoformat()
        }


# ── Attention Accounts (Real DB Queries from FomsClient + AICollectionPriority) ──
@router.get("/attention-accounts")
def get_attention_accounts(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DASHBOARD_FULL_ROLES))
):
    """
    Get collection accounts requiring immediate manager attention (Urgent or High priority).
    Allowed: Financial Manager, Head Accountant, Accountant.
    """
    try:
        foms_client = FomsClient()

        # Pull urgent & high-priority records from DB
        urgent_priorities = (
            db.query(AICollectionPriority)
            .filter(AICollectionPriority.priority.in_(["Urgent", "High"]))
            .order_by(desc(AICollectionPriority.score))
            .limit(10)
            .all()
        )

        if not urgent_priorities:
            return {"items": []}

        # Get AR data from FOMS to enrich with financial details
        ar_map = {}
        try:
            ar_list = foms_client.get_accounts_receivable()
            ar_map = {ar.get("invoiceId") or ar.get("id"): ar for ar in ar_list}
        except Exception as e:
            logger.warning(f"Could not fetch AR data from FOMS: {e}")

        items = []
        for p in urgent_priorities:
            ar_info = ar_map.get(p.invoice_id) or {}
            due_date_raw = ar_info.get("dueDate") or "2026-07-30"

            # Calculate days overdue
            try:
                due_date = datetime.strptime(due_date_raw[:10], "%Y-%m-%d")
                days_overdue = max(0, (datetime.utcnow() - due_date).days)
            except Exception:
                days_overdue = 0

            items.append({
                "priorityId": p.id,
                "invoiceNumber": p.invoice_id,
                "clientName": ar_info.get("clientName") or "Speedex Partner",
                "clientId": p.client_id,
                "outstandingBalance": float(ar_info.get("outstandingBalance") or ar_info.get("totalOutstanding") or 0.0),
                "dueDate": due_date_raw,
                "daysOverdue": days_overdue,
                "priorityLevel": p.priority,
                "score": float(p.score),
                "explanation": p.explanation,
                "reviewStatus": "Pending Review",
                "recommendationBasis": [p.explanation] if p.explanation else ["Overdue balance detected"]
            })

        return {"items": items}

    except Exception as e:
        logger.error(f"Error fetching attention accounts: {e}")
        return {"items": []}


# ── Recent Activity Feed (Real DB from ai_audit_events) ─────────────────────
@router.get("/recent-activity")
def get_recent_activity(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DASHBOARD_ALL_ROLES))
):
    """
    Get the last 20 recent activity events from the ai_audit_events table.
    Allowed: All staff roles.
    """
    try:
        events = (
            db.query(AIAuditEvent)
            .order_by(desc(AIAuditEvent.occurred_at))
            .limit(20)
            .all()
        )

        result = []
        for e in events:
            # Assign statusDot based on result and event type
            if e.result == "FAILED" or e.result == "ERROR":
                status_dot = "danger"
            elif e.event_type in ("DUPLICATE_DETECTED", "INVALID_DOCUMENT"):
                status_dot = "warning"
            elif e.event_type in ("UNIQUE_SAVED", "RECOMMENDATION_APPROVED"):
                status_dot = "success"
            else:
                status_dot = "teal"

            result.append({
                "id": e.event_id,
                "description": e.action_description,
                "relatedRecord": e.source_reference or e.related_record_type or "System",
                "timeAgo": _time_ago(e.occurred_at),
                "userRole": e.role_name or "System",
                "statusDot": status_dot,
                "eventType": e.event_type,
                "occurredAt": e.occurred_at.isoformat() if e.occurred_at else None
            })

        return result

    except Exception as e:
        logger.error(f"Error fetching recent activity: {e}")
        return []


# ── Trends (Real DB from ai_scan_logs grouped by day) ───────────────────────
@router.get("/trends")
def get_trends(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DASHBOARD_FULL_ROLES))
):
    """
    Get time-series trend data from ai_scan_logs for the past 30 days.
    Returns one data point per day with total scans and duplicate detections.
    Allowed: Financial Manager, Head Accountant, Accountant.
    """
    try:
        since = datetime.utcnow() - timedelta(days=30)

        # Group scan logs by day
        rows = (
            db.query(
                func.date_trunc("day", AIScanLog.created_at).label("day"),
                func.count(AIScanLog.id).label("total_scans"),
                func.sum(
                    case((AIScanLog.validation_status == "POSSIBLE_DUPLICATE", 1), else_=0)
                ).label("duplicates_found"),
                func.sum(
                    case((AIScanLog.is_allowed == True, 1), else_=0)
                ).label("valid_docs")
            )
            .filter(AIScanLog.created_at >= since)
            .group_by(func.date_trunc("day", AIScanLog.created_at))
            .order_by(func.date_trunc("day", AIScanLog.created_at))
            .all()
        )

        result = []
        for row in rows:
            result.append({
                "recordedAt": row.day.isoformat() if row.day else None,
                "totalOutstanding": int(row.total_scans or 0),
                "collectedAmount": int(row.valid_docs or 0),
                "duplicatesFound": int(row.duplicates_found or 0),
            })

        return result

    except Exception as e:
        logger.error(f"Error fetching trends: {e}")
        return []


# ── Review History (Real DB from ai_review_history) ──────────────────────────
@router.get("/review-history")
def get_review_history(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*AUDIT_VIEW_ROLES))
):
    """
    Get review history log from PostgreSQL ai_review_history table.
    Allowed: Financial Manager, Head Accountant, Accountant, Assistant FM.
    """
    try:
        reviews = (
            db.query(AIReviewHistory)
            .order_by(desc(AIReviewHistory.review_date))
            .limit(50)
            .all()
        )

        result = []
        for r in reviews:
            result.append({
                "id": r.id,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "decision": r.decision,
                "justification": r.remarks,
                "reviewed_by": r.reviewer_username,
                "reviewed_role": r.reviewer_role,
                "reviewed_at": r.review_date.isoformat() if r.review_date else None,
                "trace_id": r.trace_id
            })

        return result

    except Exception as e:
        logger.error(f"Error fetching review history: {e}")
        return []


# ── Audit Trail (Real DB from ai_audit_events) ───────────────────────────────
@router.get("/audit-trail")
def get_audit_trail(
    page: int = 1,
    pageSize: int = 100,
    sortBy: str = "occurred_at",
    sortDirection: str = "desc",
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*AUDIT_VIEW_ROLES))
):
    """
    Get system audit trail events from PostgreSQL ai_audit_events table.
    Supports pagination and sorting.
    Allowed: Financial Manager, Head Accountant, Accountant, Assistant FM.
    """
    try:
        query = db.query(AIAuditEvent)
        total_count = query.count()

        # Apply sorting
        sort_col = getattr(AIAuditEvent, sortBy, AIAuditEvent.occurred_at)
        if sortDirection == "desc":
            query = query.order_by(desc(sort_col))
        else:
            query = query.order_by(sort_col)

        # Apply pagination
        offset = (page - 1) * pageSize
        events = query.offset(offset).limit(pageSize).all()

        items = []
        for e in events:
            items.append({
                "eventId": e.event_id,
                "occurredAt": e.occurred_at.isoformat() if e.occurred_at else None,
                "userId": e.user_id,
                "fullName": e.full_name,
                "roleName": e.role_name,
                "eventType": e.event_type,
                "actionDescription": e.action_description,
                "relatedRecordType": e.related_record_type,
                "sourceReference": e.source_reference,
                "result": e.result,
            })

        return {"items": items, "totalCount": total_count}

    except Exception as e:
        logger.error(f"Error fetching audit trail: {e}")
        return {"items": [], "totalCount": 0}


# ── Audit Trail Summary (Real DB counts) ─────────────────────────────────────
@router.get("/audit-trail/summary")
def get_audit_trail_summary(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*AUDIT_VIEW_ROLES))
):
    """
    Get summary metrics for audit trail from real PostgreSQL ai_audit_events records.
    Allowed: Financial Manager, Head Accountant, Accountant, Assistant FM.
    """
    try:
        total_events = db.query(func.count(AIAuditEvent.event_id)).scalar() or 0

        login_events = (
            db.query(func.count(AIAuditEvent.event_id))
            .filter(AIAuditEvent.event_type.in_(["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGIN"]))
            .scalar()
        ) or 0

        duplicate_events = (
            db.query(func.count(AIAuditEvent.event_id))
            .filter(AIAuditEvent.event_type.in_([
                "DUPLICATE_DETECTED", "UNIQUE_SAVED",
                "DOCUMENT_SCAN", "MANUAL_REVIEW_SENT", "MARK_AS_UNIQUE"
            ]))
            .scalar()
        ) or 0

        collection_events = (
            db.query(func.count(AIAuditEvent.event_id))
            .filter(AIAuditEvent.event_type.in_([
                "RECOMMENDATION_APPROVED", "RECOMMENDATION_REJECTED",
                "PRIORITY_GENERATED", "COLLECTION_ACTION"
            ]))
            .scalar()
        ) or 0

        failed_attempts = (
            db.query(func.count(AIAuditEvent.event_id))
            .filter(
                (AIAuditEvent.result == "FAILED") |
                (AIAuditEvent.result == "ERROR") |
                (AIAuditEvent.event_type == "LOGIN_FAILED")
            )
            .scalar()
        ) or 0

        return {
            "totalEvents": total_events,
            "loginEvents": login_events,
            "duplicateEvents": duplicate_events,
            "collectionEvents": collection_events,
            "failedAttempts": failed_attempts
        }

    except Exception as e:
        logger.error(f"Error fetching audit trail summary: {e}")
        return {
            "totalEvents": 0,
            "loginEvents": 0,
            "duplicateEvents": 0,
            "collectionEvents": 0,
            "failedAttempts": 0
        }


# ── Create Audit Event (write to DB) ─────────────────────────────────────────
@router.post("/audit-trail")
def create_audit_event(
    body: dict,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_roles(*DASHBOARD_ALL_ROLES))
):
    """
    Allow frontend to append audit events directly into PostgreSQL ai_audit_events table.
    """
    from app.audit.logger import log_audit_event_to_db
    event_id = log_audit_event_to_db(
        event_type=body.get("eventType", "USER_ACTION"),
        action_description=body.get("actionDescription", body.get("action", "User action performed")),
        result=body.get("result", "SUCCESS"),
        user_id=payload.get("sub") or payload.get("username"),
        full_name=payload.get("name") or payload.get("sub"),
        role_name=payload.get("role"),
        related_record_type=body.get("relatedRecordType"),
        source_reference=body.get("sourceReference"),
        normalized_reference=body.get("normalizedReference"),
        details=body.get("details")
    )
    return {"success": True, "eventId": event_id}
