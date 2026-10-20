-- ============================================================================
-- PostgreSQL Initialization Schema for FOMS AI Intelligence Layer
-- Database: foms_ai_results
-- Role: AI outputs, duplicate alerts, scan logs, recommendations, audit events
-- Rule: Decision support only. Does not replace MSSQL official records.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. AI Scan Logs (Records upload validation, classification, and OCR gate results)
CREATE TABLE IF NOT EXISTS ai_scan_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    uploaded_file_name VARCHAR(255) NOT NULL,
    detected_document_type VARCHAR(100) NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    validation_status VARCHAR(50) NOT NULL, -- 'VALIDATED', 'INVALID_DOCUMENT', 'REJECTED'
    confidence DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    extracted_fields JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_scan_logs_type ON ai_scan_logs(detected_document_type);
CREATE INDEX IF NOT EXISTS idx_ai_scan_logs_created ON ai_scan_logs(created_at DESC);

-- 2. AI Duplicate Alerts (Stores potential duplicates detected across finance documents)
CREATE TABLE IF NOT EXISTS ai_duplicate_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL, -- 'WAYBILL', 'INVOICE', 'OFFICIAL_RECEIPT', 'SPEEDPAY_REFERENCE'
    source_record_id VARCHAR(100) NOT NULL,
    source_reference VARCHAR(150),
    matched_record_id VARCHAR(100) NOT NULL,
    matched_reference VARCHAR(150),
    confidence_score DECIMAL(5,2) NOT NULL, -- e.g., 95.50
    severity VARCHAR(20),
    matched_fields JSONB,
    match_reason TEXT NOT NULL,
    warning_message TEXT DEFAULT '',
    output_version VARCHAR(20),
    trace_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Needs Review' NOT NULL, -- 'Needs Review', 'Cleared for Manual Validation', 'Dismissed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dup_alert_type ON ai_duplicate_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_dup_status ON ai_duplicate_alerts(status);

-- 3. AI Duplicate Match Details (Stores raw payload comparisons)
CREATE TABLE IF NOT EXISTS ai_duplicate_matches (
    id SERIAL PRIMARY KEY,
    alert_id INT REFERENCES ai_duplicate_alerts(id) ON DELETE CASCADE,
    source_details JSONB NOT NULL,
    match_details JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. AI AR Alerts (Decision support for abnormal balance, overpayment, refund review)
CREATE TABLE IF NOT EXISTS ai_ar_alerts (
    id SERIAL PRIMARY KEY,
    invoice_id VARCHAR(100) NOT NULL,
    ar_id VARCHAR(100) NOT NULL,
    alert_type VARCHAR(50) NOT NULL, -- 'Zero Balance', 'Negative Outstanding', 'Overpayment Detected', 'Refund Review Needed'
    computed_outstanding_balance DECIMAL(15,2) NOT NULL,
    recommended_action VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_decision_support_only BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_ar_alerts_invoice ON ai_ar_alerts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ai_ar_alerts_type ON ai_ar_alerts(alert_type);

-- 5. AI Output Logs (Traceability and processing run history)
CREATE TABLE IF NOT EXISTS ai_output_logs (
    id SERIAL PRIMARY KEY,
    output_type VARCHAR(50) NOT NULL, -- 'DUPLICATE_CHECK', 'AR_ANALYSIS', 'OVERPAYMENT_SCAN'
    source_reference VARCHAR(150) NOT NULL,
    processing_status VARCHAR(50) NOT NULL, -- 'SUCCESS', 'FAILED', 'WARNING'
    version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_output_logs_type ON ai_output_logs(output_type);

-- 6. AI Collection Priorities
CREATE TABLE IF NOT EXISTS ai_collection_priorities (
    id SERIAL PRIMARY KEY,
    invoice_id VARCHAR(100) UNIQUE NOT NULL,
    invoice_number VARCHAR(100) NOT NULL,
    client_id VARCHAR(100) NOT NULL,
    client_name VARCHAR(200) NOT NULL,
    outstanding_balance DECIMAL(15,2) NOT NULL,
    due_date DATE NOT NULL,
    priority_level VARCHAR(20) NOT NULL, -- 'Urgent', 'High', 'Medium', 'Low'
    explanation_basis JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    source_invoice_number VARCHAR(150),
    normalized_invoice_number VARCHAR(150)
);
CREATE INDEX IF NOT EXISTS idx_coll_priority ON ai_collection_priorities(priority_level);
CREATE INDEX IF NOT EXISTS idx_coll_client ON ai_collection_priorities(client_id);

-- 7. AI Collection Recommendations
CREATE TABLE IF NOT EXISTS ai_collection_recommendations (
    id SERIAL PRIMARY KEY,
    priority_id INT REFERENCES ai_collection_priorities(id) ON DELETE CASCADE,
    recommended_action VARCHAR(200) NOT NULL,
    explanation_basis JSONB NOT NULL,
    review_status VARCHAR(30) DEFAULT 'Pending Review' NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. AI Human Review Decisions (Audit Trail of AI Recommendation reviews)
CREATE TABLE IF NOT EXISTS ai_review_decisions (
    id SERIAL PRIMARY KEY,
    target_type VARCHAR(50) NOT NULL, -- 'DUPLICATE_ALERT' or 'COLLECTION_RECOMMENDATION'
    target_id INT NOT NULL,
    reviewer_username VARCHAR(100) NOT NULL,
    reviewer_role VARCHAR(50) NOT NULL,
    decision VARCHAR(50) NOT NULL, -- 'Accepted as Recommendation', 'Rejected', 'Dismissed'
    remarks TEXT,
    recommended_action VARCHAR(100),
    review_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_review_target ON ai_review_decisions(target_type, target_id);

-- 9. RBAC & User Management Schemas
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
    permission_id SERIAL PRIMARY KEY,
    permission_name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(permission_id) ON DELETE CASCADE,
    PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    login_id VARCHAR(100) UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT FALSE,
    is_temporary_password BOOLEAN DEFAULT FALSE,
    password_changed_at TIMESTAMP WITH TIME ZONE,
    password_version INT DEFAULT 1
);

-- 10. AI Audit Events
CREATE TABLE IF NOT EXISTS ai_audit_events (
    event_id UUID PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id VARCHAR(100),
    full_name VARCHAR(200),
    role_name VARCHAR(100),
    event_type VARCHAR(100) NOT NULL,
    action_description TEXT NOT NULL,
    related_record_type VARCHAR(100),
    source_reference VARCHAR(200),
    normalized_reference VARCHAR(200),
    result VARCHAR(50) NOT NULL,
    ip_address VARCHAR(64),
    user_agent TEXT,
    details JSONB,
    correlation_id VARCHAR(150)
);
CREATE INDEX IF NOT EXISTS idx_ai_audit_events_occurred_at ON ai_audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_events_event_type ON ai_audit_events(event_type);

-- 11. Initial Seeds
INSERT INTO roles (role_name) VALUES
('FinancialManager'),
('HeadAccountant'),
('Accountant'),
('Coordinator'),
('AssistantFinancialManager'),
('Client')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO permissions (permission_name) VALUES
('ai.dashboard.view'),
('ai.dashboard.view_limited'),
('ai.duplicate.view'),
('ai.duplicate.waybill.view'),
('ai.duplicate.review'),
('ai.collection.view'),
('ai.collection.validate'),
('ai.reports.view'),
('ai.reports.view_limited'),
('ai.audit.view'),
('ai.audit.view_limited'),
('ai.audit.export')
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO users (login_id, full_name, email, password_hash, role_name) VALUES
('EMP-001', 'Crystalyn Joyce C. Fajardo', 'finance.manager@speedex.test', 'AQAAAAIAAYagAAAAEH/ZkZ1v7L70m6P0x8hYmS8rD8fW1wQzZ0V2yN3m9w0v4y==', 'FinancialManager'),
('EMP-002', 'Mariel Maricel Anonuevo', 'head.accountant@speedex.test', 'AQAAAAIAAYagAAAAEH/ZkZ1v7L70m6P0x8hYmS8rD8fW1wQzZ0V2yN3m9w0v4y==', 'HeadAccountant'),
('EMP-003', 'Misty', 'staff.accountant@speedex.test', 'AQAAAAIAAYagAAAAEH/ZkZ1v7L70m6P0x8hYmS8rD8fW1wQzZ0V2yN3m9w0v4y==', 'Accountant'),
('EMP-004', 'Joana Marie Chan Ogaya', 'coordinator@speedex.test', 'AQAAAAIAAYagAAAAEH/ZkZ1v7L70m6P0x8hYmS8rD8fW1wQzZ0V2yN3m9w0v4y==', 'Coordinator'),
('EMP-005', 'Hannah Marie Estrera', 'assistant.fm@speedex.test', 'AQAAAAIAAYagAAAAEH/ZkZ1v7L70m6P0x8hYmS8rD8fW1wQzZ0V2yN3m9w0v4y==', 'AssistantFinancialManager'),
('EMP-006', 'Client', 'client@external.test', 'AQAAAAIAAYagAAAAEH/ZkZ1v7L70m6P0x8hYmS8rD8fW1wQzZ0V2yN3m9w0v4y==', 'Client')
ON CONFLICT (email) DO NOTHING;
