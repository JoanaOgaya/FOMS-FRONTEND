from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, date

# Generic Response
class MessageResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None
    traceId: Optional[str] = None

# Duplicate Requests
class WaybillDuplicateRequest(BaseModel):
    waybillNumber: str
    clientId: str

class InvoiceDuplicateRequest(BaseModel):
    invoiceNumber: str
    clientId: str
    billingReference: Optional[str] = None
    waybillBasis: Optional[str] = None
    amount: float

class OfficialReceiptDuplicateRequest(BaseModel):
    receiptNumber: str

class SpeedPayDuplicateRequest(BaseModel):
    referenceNumber: str
    clientId: str
    invoiceId: Optional[str] = None
    amount: float
    submissionDate: Optional[str] = None

class DuplicateReviewRequest(BaseModel):
    decision: str = Field(..., description="CANCEL, REVISE, PROCEED")
    justification: Optional[str] = Field(None, description="Required if PROCEED")

# Duplicate Response
class DuplicateMatchSchema(BaseModel):
    source_details: dict
    match_details: dict

    class Config:
        from_attributes = True

class DuplicateAlertSchema(BaseModel):
    id: int
    alert_type: str
    source_record_id: str
    matched_record_id: str
    confidence_score: float
    severity: Optional[str] = None
    matched_fields: Optional[Any] = None
    match_reason: str
    status: str
    created_at: datetime
    output_version: Optional[str] = None
    trace_id: Optional[str] = None
    matches: Optional[List[DuplicateMatchSchema]] = []

    class Config:
        from_attributes = True

# Collection Priorities
class ReadinessResponse(BaseModel):
    retrieval_time: datetime
    total_record_count: int
    ready_count: int
    incomplete_count: int
    invalid_count: int

class PriorityFactorSchema(BaseModel):
    name: str
    value: Any
    contribution: float

class CollectionPrioritySchema(BaseModel):
    priority: str
    score: float
    factors: List[PriorityFactorSchema]
    explanation: str
    source_references: List[str] = []
    generated_time: datetime
    rules_version: str

# Recommendation Requests & Responses
class RecommendationDecisionRequest(BaseModel):
    decision: str = Field(..., description="APPROVED or REJECTED")
    remarks: Optional[str] = Field(None, description="Required for REJECTED")
    recommendedAction: Optional[str] = Field(None)

class RecommendationDashboardSummary(BaseModel):
    total_recommendations: int
    high_priority_count: int
    medium_priority_count: int
    low_priority_count: int
    total_outstanding_amount: float
    pending_validation_count: int
    approved_count: int
    rejected_count: int
    priority_distribution: dict

# Audit Review Decision Response
class ReviewDecisionSchema(BaseModel):
    id: int
    alert_id: int
    decision: str
    justification: Optional[str]
    reviewed_by: str
    reviewed_role: str
    reviewed_at: datetime
    trace_id: Optional[str]

    class Config:
        from_attributes = True

# Trend Snapshot Data Schema (For MongoDB response)
class TrendSnapshotSchema(BaseModel):
    recordedAt: datetime
    clientId: str
    trendType: str
    totalOutstanding: float
    overdueInvoiceCount: int
    collectedAmount: float
    averageCollectionDays: int

# Persistence Schemas for Frontend Database Sync
class UniqueDocumentCreateRequest(BaseModel):
    documentType: str
    documentNumber: str
    clientName: Optional[str] = None
    amount: Optional[float] = 0.0
    transactionDate: Optional[str] = None
    referenceNumber: Optional[str] = None
    waybillNumber: Optional[str] = None
    sourceType: Optional[str] = "Uploaded"
    scannedBy: Optional[str] = None
    scannedRole: Optional[str] = None
    aiResult: Optional[str] = "No Duplicate Detected"
    similarityScore: Optional[float] = 0.0

class ReviewHistoryCreateRequest(BaseModel):
    targetType: Optional[str] = "DUPLICATE_ALERT"
    targetId: str
    reviewerUsername: Optional[str] = None
    reviewerRole: Optional[str] = None
    decision: str
    remarks: Optional[str] = None
    recommendedAction: Optional[str] = None

class AuditEventCreateRequest(BaseModel):
    eventType: str
    actionDescription: str
    result: Optional[str] = "SUCCESS"
    relatedRecordType: Optional[str] = None
    sourceReference: Optional[str] = None
    normalizedReference: Optional[str] = None
    details: Optional[dict] = None
