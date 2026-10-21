IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ApprovalThresholdSettings')
BEGIN
    CREATE TABLE dbo.ApprovalThresholdSettings (
        threshold_id INT IDENTITY(1,1) PRIMARY KEY,
        transaction_type NVARCHAR(100) NOT NULL,
        role_name NVARCHAR(100) NOT NULL,
        maximum_amount DECIMAL(18,2) NOT NULL,
        currency NVARCHAR(10) NOT NULL DEFAULT 'PHP',
        effective_from DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        effective_to DATETIME2 NULL,
        is_active BIT NOT NULL DEFAULT 1,
        updated_by NVARCHAR(100) NOT NULL DEFAULT 'System',
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    INSERT INTO dbo.ApprovalThresholdSettings (transaction_type, role_name, maximum_amount, currency, is_active, updated_by)
    VALUES ('CashOutflow', 'Assistant Financial Manager', 10000.00, 'PHP', 1, 'Finance Policy System');
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CashOutflowApprovalRequests')
BEGIN
    CREATE TABLE dbo.CashOutflowApprovalRequests (
        approval_request_id INT IDENTITY(1,1) PRIMARY KEY,
        request_guid NVARCHAR(50) NOT NULL,
        cash_outflow_id NVARCHAR(50) NOT NULL,
        transaction_reference NVARCHAR(100) NOT NULL,
        payee NVARCHAR(150) NULL,
        category NVARCHAR(100) NULL,
        purpose NVARCHAR(500) NULL,
        amount DECIMAL(18,2) NOT NULL,
        currency NVARCHAR(10) NOT NULL DEFAULT 'PHP',
        approval_level NVARCHAR(50) NOT NULL,
        assigned_role NVARCHAR(100) NOT NULL,
        assigned_user_id INT NULL,
        status NVARCHAR(50) NOT NULL,
        is_escalated BIT NOT NULL DEFAULT 0,
        escalation_threshold DECIMAL(18,2) NULL,
        submitted_by NVARCHAR(100) NOT NULL,
        submitted_by_id NVARCHAR(50) NULL,
        submitted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        escalated_by NVARCHAR(100) NULL,
        escalated_at DATETIME2 NULL,
        escalation_reason NVARCHAR(500) NULL,
        reviewed_by NVARCHAR(100) NULL,
        reviewed_at DATETIME2 NULL,
        rejection_reason NVARCHAR(500) NULL,
        remarks NVARCHAR(500) NULL,
        supporting_documents NVARCHAR(MAX) NULL,
        is_posted BIT NOT NULL DEFAULT 0,
        posted_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE UNIQUE INDEX UX_ApprovalRequests_Guid ON dbo.CashOutflowApprovalRequests (request_guid);
    CREATE INDEX IX_ApprovalRequests_Reference ON dbo.CashOutflowApprovalRequests (transaction_reference);
    CREATE INDEX IX_ApprovalRequests_Status ON dbo.CashOutflowApprovalRequests (status);
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CashOutflowApprovalHistory')
BEGIN
    CREATE TABLE dbo.CashOutflowApprovalHistory (
        history_id INT IDENTITY(1,1) PRIMARY KEY,
        approval_request_id INT NOT NULL,
        actor_user_id NVARCHAR(100) NOT NULL,
        actor_name NVARCHAR(150) NULL,
        actor_role NVARCHAR(100) NOT NULL,
        action NVARCHAR(50) NOT NULL,
        previous_status NVARCHAR(50) NOT NULL,
        new_status NVARCHAR(50) NOT NULL,
        remarks NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_ApprovalHistory_Request ON dbo.CashOutflowApprovalHistory (approval_request_id);
END;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'CashOutflowId')
    ALTER TABLE dbo.CashOutflows ADD CashOutflowId NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'SourceReference')
    ALTER TABLE dbo.CashOutflows ADD SourceReference NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'LiquidationId')
    ALTER TABLE dbo.CashOutflows ADD LiquidationId NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'RecordedBy')
    ALTER TABLE dbo.CashOutflows ADD RecordedBy NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'OutflowDate')
    ALTER TABLE dbo.CashOutflows ADD OutflowDate DATETIME2 NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'payee')
    ALTER TABLE dbo.CashOutflows ADD payee NVARCHAR(150) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'currency')
    ALTER TABLE dbo.CashOutflows ADD currency NVARCHAR(10) NULL DEFAULT 'PHP';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'supporting_documents')
    ALTER TABLE dbo.CashOutflows ADD supporting_documents NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'submitted_by')
    ALTER TABLE dbo.CashOutflows ADD submitted_by NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'approval_level')
    ALTER TABLE dbo.CashOutflows ADD approval_level NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'assigned_approver')
    ALTER TABLE dbo.CashOutflows ADD assigned_approver NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CashOutflows') AND name = 'updated_at')
    ALTER TABLE dbo.CashOutflows ADD updated_at DATETIME2 NULL;
