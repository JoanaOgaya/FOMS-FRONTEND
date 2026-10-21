from sqlalchemy import create_engine, Column, Integer, String, Numeric, DateTime, Date, ForeignKey, Text, Boolean, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
from app.core.config import settings

# Compatible with both PostgreSQL (native JSONB) and SQLite (native JSON)
SafeJSON = JSONB().with_variant(JSON, "sqlite")

try:
    engine = create_engine(settings.POSTGRES_URI, pool_pre_ping=True)
except Exception:
    engine = create_engine("sqlite:///foms_ai_local.db")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 1. AI Duplicate Alerts Model
class AIDuplicateAlert(Base):
    __tablename__ = "ai_duplicate_alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String(50), nullable=False)
    source_record_id = Column(String(100), nullable=False, index=True)
    matched_record_id = Column(String(100), nullable=False)
    confidence_score = Column(Numeric(5, 2), nullable=False)
    severity = Column(String(20))
    matched_fields = Column(SafeJSON)
    match_reason = Column(Text, nullable=False)
    status = Column(String(30), default="Pending Review", nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    output_version = Column(String(20))
    trace_id = Column(String(100))
    
    # Optional relationship for storing full match details if needed
    matches = relationship("AIDuplicateMatch", back_populates="alert", cascade="all, delete-orphan")

# Keep the match model to store the safe summaries as required by SB-003
class AIDuplicateMatch(Base):
    __tablename__ = "ai_duplicate_matches"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("ai_duplicate_alerts.id", ondelete="CASCADE"))
    source_details = Column(SafeJSON, nullable=False)
    match_details = Column(SafeJSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    alert = relationship("AIDuplicateAlert", back_populates="matches")

# 2. AI Duplicate Reviews
class AIDuplicateReview(Base):
    __tablename__ = "ai_duplicate_reviews"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("ai_duplicate_alerts.id", ondelete="CASCADE"))
    decision = Column(String(50), nullable=False)
    justification = Column(Text)
    reviewed_by = Column(String(100), nullable=False)
    reviewed_role = Column(String(50), nullable=False)
    reviewed_at = Column(DateTime, default=datetime.utcnow)
    trace_id = Column(String(100))

# 3. AI Collection Runs
class AICollectionRun(Base):
    __tablename__ = "ai_collection_runs"

    id = Column(Integer, primary_key=True, index=True)
    as_of_date = Column(DateTime, nullable=False)
    model_version = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)
    record_count = Column(Integer, default=0)
    generated_at = Column(DateTime, default=datetime.utcnow)
    trace_id = Column(String(100))

# 4. AI Collection Priorities
class AICollectionPriority(Base):
    __tablename__ = "ai_collection_priorities"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("ai_collection_runs.id", ondelete="CASCADE"))
    invoice_id = Column(String(100), nullable=False, index=True)
    client_id = Column(String(100), nullable=False)
    score = Column(Numeric(5, 2), nullable=False)
    priority = Column(String(20), nullable=False, index=True)
    explanation = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    factors = relationship("AIPriorityFactor", back_populates="priority_result", cascade="all, delete-orphan")
    recommendation = relationship("AIRecommendation", back_populates="priority_result", uselist=False, cascade="all, delete-orphan")

# 5. AI Priority Factors
class AIPriorityFactor(Base):
    __tablename__ = "ai_priority_factors"

    id = Column(Integer, primary_key=True, index=True)
    priority_result_id = Column(Integer, ForeignKey("ai_collection_priorities.id", ondelete="CASCADE"))
    factor_name = Column(String(100), nullable=False)
    factor_value = Column(String(100))
    contribution = Column(Numeric(5, 2), nullable=False)

    priority_result = relationship("AICollectionPriority", back_populates="factors")

# 6. AI Recommendations
class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    priority_result_id = Column(Integer, ForeignKey("ai_collection_priorities.id", ondelete="CASCADE"))
    recommendation_text = Column(String(250), nullable=False)
    decision_support_notice = Column(String(250), nullable=False)
    status = Column(String(30), default="Pending Review", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    priority_result = relationship("AICollectionPriority", back_populates="recommendation")

# 7. AI Recommendation Decisions
class AIRecommendationDecision(Base):
    __tablename__ = "ai_recommendation_decisions"

    id = Column(Integer, primary_key=True, index=True)
    recommendation_id = Column(Integer, ForeignKey("ai_recommendations.id", ondelete="CASCADE"))
    decision = Column(String(50), nullable=False)
    remarks = Column(Text)
    decided_by = Column(String(100), nullable=False)
    decided_role = Column(String(50), nullable=False)
    decided_at = Column(DateTime, default=datetime.utcnow)
    trace_id = Column(String(100))

# 8. AI Output Logs
class AIOutputLog(Base):
    __tablename__ = "ai_output_logs"

    id = Column(Integer, primary_key=True, index=True)
    output_type = Column(String(50), nullable=False)
    source_reference = Column(String(100), index=True)
    version = Column(String(20))
    status = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    trace_id = Column(String(100))

# 9. AI Audit Events (§21)
class AIAuditEvent(Base):
    __tablename__ = "ai_audit_events"

    event_id = Column(String(100), primary_key=True, index=True)
    occurred_at = Column(DateTime, default=datetime.utcnow, index=True)
    user_id = Column(String(100))
    full_name = Column(String(150))
    role_name = Column(String(50))
    event_type = Column(String(100), nullable=False, index=True)
    action_description = Column(Text, nullable=False)
    related_record_type = Column(String(50))
    source_reference = Column(String(100))
    normalized_reference = Column(String(100))
    result = Column(String(50), default="SUCCESS")
    ip_address = Column(String(50))
    user_agent = Column(Text)
    details = Column(SafeJSON)
    correlation_id = Column(String(100))

# 10. AI Unique Scanned Documents
class AIUniqueDocument(Base):
    __tablename__ = "ai_unique_documents"

    id = Column(Integer, primary_key=True, index=True)
    document_type = Column(String(50), nullable=False)
    document_number = Column(String(100), nullable=False, index=True)
    client_name = Column(String(200))
    amount = Column(Numeric(12, 2))
    transaction_date = Column(String(50))
    reference_number = Column(String(100))
    waybill_number = Column(String(100))
    source_type = Column(String(20), default="Uploaded")
    scanned_by = Column(String(100))
    scanned_role = Column(String(50))
    ai_result = Column(String(50), default="No Duplicate Detected")
    similarity_score = Column(Numeric(5, 2), default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    trace_id = Column(String(100))

# 11. AI Review History
class AIReviewHistory(Base):
    __tablename__ = "ai_review_history"

    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(50), nullable=False)
    target_id = Column(String(100), nullable=False)
    reviewer_username = Column(String(100), nullable=False)
    reviewer_role = Column(String(50), nullable=False)
    decision = Column(String(50), nullable=False)
    remarks = Column(Text)
    recommended_action = Column(String(150))
    review_date = Column(DateTime, default=datetime.utcnow, index=True)
    trace_id = Column(String(100))

# 12. AI Scan Logs (Document Validation)
class AIScanLog(Base):
    __tablename__ = "ai_scan_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100))
    uploaded_file_name = Column(String(255), nullable=False)
    detected_document_type = Column(String(100))
    is_allowed = Column(Boolean, default=False)
    validation_status = Column(String(50))
    reason = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


