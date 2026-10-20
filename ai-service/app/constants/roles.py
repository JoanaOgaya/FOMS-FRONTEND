"""
Centralized FOMS Role and Permission Constants.
These are the ONLY official system roles. Do not use project-team labels.
Reused by both ASP.NET Core (via matching strings) and FastAPI.
"""
from enum import Enum
from typing import Dict, FrozenSet


class Roles(str, Enum):
    """Official FOMS system roles — §3 of security specification."""
    FINANCIAL_MANAGER = "Finance Manager"
    HEAD_ACCOUNTANT = "Head Accountant"
    ACCOUNTANT = "Accountant"
    COORDINATOR = "Coordinator"
    ASSISTANT_OF_FINANCIAL_MANAGER = "Assistant of Finance Manager"
    CLIENT = "Client"


class Permissions(str, Enum):
    """Granular permission constants for AI Layer endpoints — §4 RBAC matrix."""

    # Dashboard
    DASHBOARD_VIEW = "ai.dashboard.view"
    DASHBOARD_VIEW_LIMITED = "ai.dashboard.view_limited"

    # Duplicate Detection
    DUPLICATE_VIEW = "ai.duplicate.view"
    DUPLICATE_REVIEW = "ai.duplicate.review"
    DUPLICATE_SCAN = "ai.duplicate.scan"
    DUPLICATE_WAYBILL_VIEW = "ai.duplicate.waybill.view"

    # Collection Priorities
    COLLECTION_VIEW = "ai.collection.view"
    COLLECTION_GENERATE = "ai.collection.generate"
    COLLECTION_VALIDATE = "ai.collection.validate"

    # Recommendations
    RECOMMENDATION_VIEW = "ai.recommendation.view"
    RECOMMENDATION_DECIDE = "ai.recommendation.decide"
    RECOMMENDATION_EXPORT = "ai.recommendation.export"

    # Reports
    REPORTS_VIEW = "ai.reports.view"
    REPORTS_VIEW_LIMITED = "ai.reports.view_limited"
    REPORTS_EXPORT = "ai.reports.export"

    # Audit
    AUDIT_VIEW = "ai.audit.view"
    AUDIT_VIEW_LIMITED = "ai.audit.view_limited"

    # System Health (Financial Manager only)
    SYSTEM_HEALTH_VIEW = "ai.system.health.view"


# ── §4 AI Layer RBAC Matrix ──────────────────────────────────────────────
# Maps each official FOMS role to its permitted set of AI-layer permissions.
# This is the single source of truth for server-side authorization.

ROLE_PERMISSIONS: Dict[Roles, FrozenSet[Permissions]] = {
    Roles.FINANCIAL_MANAGER: frozenset([
        Permissions.DASHBOARD_VIEW,
        Permissions.DUPLICATE_VIEW,
        Permissions.DUPLICATE_REVIEW,
        Permissions.DUPLICATE_SCAN,
        Permissions.COLLECTION_VIEW,
        Permissions.COLLECTION_GENERATE,
        Permissions.COLLECTION_VALIDATE,
        Permissions.RECOMMENDATION_VIEW,
        Permissions.RECOMMENDATION_DECIDE,
        Permissions.RECOMMENDATION_EXPORT,
        Permissions.REPORTS_VIEW,
        Permissions.REPORTS_EXPORT,
        Permissions.AUDIT_VIEW,
        Permissions.SYSTEM_HEALTH_VIEW,
    ]),

    Roles.HEAD_ACCOUNTANT: frozenset([
        Permissions.DASHBOARD_VIEW,
        Permissions.DUPLICATE_VIEW,
        Permissions.DUPLICATE_REVIEW,
        Permissions.DUPLICATE_SCAN,
        Permissions.COLLECTION_VIEW,
        Permissions.COLLECTION_GENERATE,
        Permissions.RECOMMENDATION_VIEW,
        Permissions.RECOMMENDATION_DECIDE,
        Permissions.REPORTS_VIEW,
        Permissions.AUDIT_VIEW_LIMITED,
    ]),

    Roles.ACCOUNTANT: frozenset([
        Permissions.DASHBOARD_VIEW,
        Permissions.DUPLICATE_VIEW,
        Permissions.DUPLICATE_REVIEW,
        Permissions.DUPLICATE_SCAN,
        Permissions.COLLECTION_VIEW,
        Permissions.COLLECTION_GENERATE,
        Permissions.RECOMMENDATION_VIEW,
        Permissions.REPORTS_VIEW,
        Permissions.AUDIT_VIEW_LIMITED,
    ]),

    Roles.COORDINATOR: frozenset([
        Permissions.DASHBOARD_VIEW_LIMITED,
        Permissions.DUPLICATE_WAYBILL_VIEW,
        Permissions.DUPLICATE_VIEW,
        Permissions.DUPLICATE_SCAN,  # Added for scanning waybills/PODs
    ]),

    Roles.ASSISTANT_OF_FINANCIAL_MANAGER: frozenset([
        Permissions.DASHBOARD_VIEW_LIMITED,
        Permissions.REPORTS_VIEW_LIMITED,
        Permissions.AUDIT_VIEW_LIMITED,
        Permissions.DUPLICATE_VIEW,  # Needed for checking liquidation supporting docs
        Permissions.DUPLICATE_SCAN,  # Added for scanning liquidation receipts
    ]),

    Roles.CLIENT: frozenset([
        # Clients have NO AI dashboard/internal permissions.
        # They may only access approved client-facing features
        # (SpeedPay, own invoices, own balances) through the FOMS backend.
    ]),
}


# ── Convenience sets for route decorators ────────────────────────────────

# Roles allowed to view the full AI dashboard
DASHBOARD_FULL_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
)

# Roles allowed limited dashboard view
DASHBOARD_ALL_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# Roles allowed to run duplicate checks & view alerts
DUPLICATE_CHECK_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# Roles allowed to review duplicate alerts
DUPLICATE_REVIEW_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
)

# Roles allowed to scan documents (OCR)
DOCUMENT_SCAN_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# Roles allowed to view collection priorities
COLLECTION_VIEW_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# Roles allowed to generate collection priorities
COLLECTION_GENERATE_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
)

# Roles allowed to view recommendations
RECOMMENDATION_VIEW_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# Roles allowed to log decisions from Collection Priorities page
# (Accountant, Coordinator, Assistant FM log initial actions -> goes to ForReview)
LOG_DECISION_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# Roles allowed to approve/finalize decisions in ForReview page
# (Finance Manager, Head Accountant only)
RECOMMENDATION_DECIDE_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# Roles allowed to export recommendations/reports
EXPORT_ROLES = (
    Roles.FINANCIAL_MANAGER,
)

# Roles allowed to view audit trail
AUDIT_VIEW_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)

# All staff roles (excludes Client)
ALL_STAFF_ROLES = (
    Roles.FINANCIAL_MANAGER,
    Roles.HEAD_ACCOUNTANT,
    Roles.ACCOUNTANT,
    Roles.COORDINATOR,
    Roles.ASSISTANT_OF_FINANCIAL_MANAGER,
)
