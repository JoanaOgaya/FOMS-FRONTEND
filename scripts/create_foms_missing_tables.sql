-- ============================================================================
-- FOMS Database Migration - Add Missing Tables & Align with FOMS_DB
-- Safe migrations only: Does NOT drop existing tables or delete existing data
-- ============================================================================

USE FOMS_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Roles table alignment
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Roles' AND COLUMN_NAME = 'role_id')
BEGIN
    ALTER TABLE Roles ADD role_id INT NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Roles' AND COLUMN_NAME = 'role_name')
BEGIN
    ALTER TABLE Roles ADD role_name NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Roles' AND COLUMN_NAME = 'created_at')
BEGIN
    ALTER TABLE Roles ADD created_at DATETIME2 NULL DEFAULT SYSUTCDATETIME();
END
GO

-- Seed Roles if missing
IF NOT EXISTS (SELECT 1 FROM Roles WHERE role_name = 'Financial Manager' OR Name = 'Financial Manager')
BEGIN
    INSERT INTO Roles (Id, Name, Description, role_id, role_name, created_at)
    VALUES ('ROLE-001', 'Financial Manager', 'Financial Operations Manager', 1, 'Financial Manager', SYSUTCDATETIME());
END
ELSE
BEGIN
    UPDATE Roles SET role_id = 1, role_name = 'Financial Manager' WHERE Name = 'Financial Manager' OR role_name = 'Financial Manager';
END
GO

IF NOT EXISTS (SELECT 1 FROM Roles WHERE role_name = 'Head Accountant' OR Name = 'Head Accountant')
BEGIN
    INSERT INTO Roles (Id, Name, Description, role_id, role_name, created_at)
    VALUES ('ROLE-002', 'Head Accountant', 'Head Accountant', 2, 'Head Accountant', SYSUTCDATETIME());
END
ELSE
BEGIN
    UPDATE Roles SET role_id = 2, role_name = 'Head Accountant' WHERE Name = 'Head Accountant' OR role_name = 'Head Accountant';
END
GO

IF NOT EXISTS (SELECT 1 FROM Roles WHERE role_name = 'Accountant' OR Name = 'Accountant')
BEGIN
    INSERT INTO Roles (Id, Name, Description, role_id, role_name, created_at)
    VALUES ('ROLE-003', 'Accountant', 'Accountant', 3, 'Accountant', SYSUTCDATETIME());
END
ELSE
BEGIN
    UPDATE Roles SET role_id = 3, role_name = 'Accountant' WHERE Name = 'Accountant' OR role_name = 'Accountant';
END
GO

IF NOT EXISTS (SELECT 1 FROM Roles WHERE role_name = 'Assistant Financial Manager' OR Name = 'Assistant Financial Manager')
BEGIN
    INSERT INTO Roles (Id, Name, Description, role_id, role_name, created_at)
    VALUES ('ROLE-004', 'Assistant Financial Manager', 'Assistant Financial Manager', 4, 'Assistant Financial Manager', SYSUTCDATETIME());
END
ELSE
BEGIN
    UPDATE Roles SET role_id = 4, role_name = 'Assistant Financial Manager' WHERE Name = 'Assistant Financial Manager' OR role_name = 'Assistant Financial Manager';
END
GO

-- 2. Users table (Required for EMP-001 login and user management)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        user_id INT IDENTITY(1,1) PRIMARY KEY,
        employee_number NVARCHAR(50) NOT NULL UNIQUE,
        full_name NVARCHAR(200) NOT NULL,
        username NVARCHAR(100) NOT NULL UNIQUE,
        password_hash NVARCHAR(500) NOT NULL,
        role_id INT NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Users_EmployeeNumber ON Users(employee_number);
    CREATE INDEX IX_Users_Username ON Users(username);
END
GO

-- 3. Clients table alignment (ensure client_id and company_name columns exist)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Clients' AND COLUMN_NAME = 'client_id')
BEGIN
    ALTER TABLE Clients ADD client_id INT NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Clients' AND COLUMN_NAME = 'company_name')
BEGIN
    ALTER TABLE Clients ADD company_name NVARCHAR(200) NULL;
END
GO

UPDATE Clients SET client_id = 1, company_name = Name WHERE Id = 'CA-001';
UPDATE Clients SET client_id = 2, company_name = Name WHERE Id = 'CA-002';
GO

-- 4. ClientFinanceSettings table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ClientFinanceSettings')
BEGIN
    CREATE TABLE ClientFinanceSettings (
        finance_setting_id INT IDENTITY(1,1) PRIMARY KEY,
        client_id INT NOT NULL,
        billing_terms NVARCHAR(100) NOT NULL DEFAULT '30 Days',
        payment_terms NVARCHAR(100) NOT NULL DEFAULT 'Net 30',
        credit_terms_days INT NOT NULL DEFAULT 30,
        tax_type NVARCHAR(50) NOT NULL DEFAULT 'VATable',
        oda_rate_applicable BIT NOT NULL DEFAULT 1,
        finance_status NVARCHAR(50) NOT NULL DEFAULT 'Active',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ClientFinanceSettings_ClientId ON ClientFinanceSettings(client_id);
END
GO

-- Seed ClientFinanceSettings for existing clients CA-001 & CA-002 if empty
IF NOT EXISTS (SELECT 1 FROM ClientFinanceSettings WHERE client_id = 1)
BEGIN
    INSERT INTO ClientFinanceSettings (client_id, billing_terms, payment_terms, credit_terms_days, tax_type, oda_rate_applicable, finance_status)
    VALUES (1, '30 Days', 'Net 30', 30, 'VATable', 1, 'Active');
END
IF NOT EXISTS (SELECT 1 FROM ClientFinanceSettings WHERE client_id = 2)
BEGIN
    INSERT INTO ClientFinanceSettings (client_id, billing_terms, payment_terms, credit_terms_days, tax_type, oda_rate_applicable, finance_status)
    VALUES (2, '15 Days', 'Net 15', 15, 'VATable', 1, 'Active');
END
GO

-- 5. ClientRates table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ClientRates')
BEGIN
    CREATE TABLE ClientRates (
        rate_id INT IDENTITY(1,1) PRIMARY KEY,
        client_id INT NOT NULL,
        service_type NVARCHAR(100) NOT NULL DEFAULT 'Standard Delivery',
        delivery_area NVARCHAR(100) NOT NULL,
        minimum_kg DECIMAL(18,2) NOT NULL DEFAULT 5.00,
        minimum_rate DECIMAL(18,2) NOT NULL DEFAULT 100.00,
        excess_rate_per_kg DECIMAL(18,2) NOT NULL DEFAULT 25.00,
        oda_rate DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        fuel_surcharge_rate DECIMAL(18,4) NOT NULL DEFAULT 0.1500,
        valuation_rate DECIMAL(18,4) NOT NULL DEFAULT 0.0100,
        effective_from DATE NULL,
        effective_to DATE NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ClientRates_Client ON ClientRates(client_id, delivery_area);
END
GO

-- Seed ClientRates for client 1 (Lazada: NCR, Luzon)
IF NOT EXISTS (SELECT 1 FROM ClientRates WHERE client_id = 1)
BEGIN
    INSERT INTO ClientRates (client_id, service_type, delivery_area, minimum_kg, minimum_rate, excess_rate_per_kg, oda_rate, fuel_surcharge_rate, valuation_rate, is_active)
    VALUES 
    (1, 'Standard Delivery', 'NCR', 5.00, 100.00, 25.00, 0.00, 0.1500, 0.0100, 1),
    (1, 'Standard Delivery', 'Luzon', 5.00, 150.00, 30.00, 50.00, 0.1500, 0.0100, 1);
END
GO

-- 6. Invoices table alignment
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'invoice_id')
BEGIN
    ALTER TABLE Invoices ADD invoice_id INT NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'invoice_number')
BEGIN
    ALTER TABLE Invoices ADD invoice_number NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'billing_period')
BEGIN
    ALTER TABLE Invoices ADD billing_period NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'invoice_status')
BEGIN
    ALTER TABLE Invoices ADD invoice_status NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'validation_status')
BEGIN
    ALTER TABLE Invoices ADD validation_status NVARCHAR(50) NULL;
END
GO

UPDATE Invoices SET invoice_id = 1, invoice_number = InvoiceNo, invoice_status = 'Pending Validation', validation_status = 'Pending Validation', billing_period = 'October 2026' WHERE Id = 'INV-001';
UPDATE Invoices SET invoice_id = 2, invoice_number = InvoiceNo, invoice_status = 'Approved', validation_status = 'Validated', billing_period = 'October 2026' WHERE Id = 'INV-002';
GO

-- 7. AccountsReceivable table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AccountsReceivable')
BEGIN
    CREATE TABLE AccountsReceivable (
        ar_id INT IDENTITY(1,1) PRIMARY KEY,
        invoice_id INT NOT NULL,
        client_id INT NOT NULL,
        invoice_amount DECIMAL(18,2) NOT NULL,
        paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        outstanding_balance DECIMAL(18,2) NOT NULL,
        overpayment_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        ar_status NVARCHAR(50) NOT NULL DEFAULT 'Outstanding',
        due_date DATE NULL,
        aging_bucket NVARCHAR(50) NOT NULL DEFAULT '0-30 days',
        collection_priority NVARCHAR(50) NOT NULL DEFAULT 'Normal',
        refund_status NVARCHAR(50) NOT NULL DEFAULT 'Not Required',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AR_Invoice ON AccountsReceivable(invoice_id);
    CREATE INDEX IX_AR_Client ON AccountsReceivable(client_id);
END
GO

-- Seed AccountsReceivable from existing unpaid invoices if empty
IF NOT EXISTS (SELECT 1 FROM AccountsReceivable WHERE invoice_id = 1)
BEGIN
    INSERT INTO AccountsReceivable (invoice_id, client_id, invoice_amount, paid_amount, outstanding_balance, overpayment_amount, ar_status, due_date, aging_bucket, collection_priority)
    VALUES (1, 1, 50000.00, 0.00, 50000.00, 0.00, 'Outstanding', CAST(DATEADD(day, 15, GETDATE()) AS DATE), '0-30 days', 'Normal');
END
IF NOT EXISTS (SELECT 1 FROM AccountsReceivable WHERE invoice_id = 2)
BEGIN
    INSERT INTO AccountsReceivable (invoice_id, client_id, invoice_amount, paid_amount, outstanding_balance, overpayment_amount, ar_status, due_date, aging_bucket, collection_priority)
    VALUES (2, 1, 30000.00, 0.00, 30000.00, 0.00, 'Outstanding', CAST(DATEADD(day, 20, GETDATE()) AS DATE), '0-30 days', 'Normal');
END
GO

-- 8. Payments table alignment
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Payments' AND COLUMN_NAME = 'payment_id')
BEGIN
    ALTER TABLE Payments ADD payment_id INT NULL;
END
GO
UPDATE Payments SET payment_id = 1 WHERE Id = 'PAY-001';
GO

-- 9. PaymentHistory table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PaymentHistory')
BEGIN
    CREATE TABLE PaymentHistory (
        history_id INT IDENTITY(1,1) PRIMARY KEY,
        payment_id INT NULL,
        invoice_id INT NULL,
        status NVARCHAR(50) NULL,
        action NVARCHAR(100) NULL,
        remarks NVARCHAR(500) NULL,
        performed_by INT NULL,
        performed_role NVARCHAR(100) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 10. Waybills table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Waybills')
BEGIN
    CREATE TABLE Waybills (
        waybill_id INT IDENTITY(1,1) PRIMARY KEY,
        waybill_number NVARCHAR(100) NOT NULL UNIQUE,
        client_id INT NOT NULL,
        origin NVARCHAR(200) NULL,
        destination NVARCHAR(200) NULL,
        delivery_area NVARCHAR(100) NULL,
        actual_weight DECIMAL(18,2) NULL,
        length_cm DECIMAL(18,2) NULL,
        width_cm DECIMAL(18,2) NULL,
        height_cm DECIMAL(18,2) NULL,
        number_of_boxes INT NULL,
        declared_value DECIMAL(18,2) NULL,
        delivery_status NVARCHAR(50) NULL DEFAULT 'Delivered',
        pod_status NVARCHAR(50) NULL DEFAULT 'Validated',
        is_billed BIT NOT NULL DEFAULT 0,
        invoice_id INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Waybills_Number ON Waybills(waybill_number);
    CREATE INDEX IX_Waybills_Client ON Waybills(client_id);
END
GO

-- 11. BillingDocuments table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BillingDocuments')
BEGIN
    CREATE TABLE BillingDocuments (
        billing_doc_id INT IDENTITY(1,1) PRIMARY KEY,
        waybill_id INT NOT NULL,
        client_id INT NOT NULL,
        computed_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        validation_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        ctc_status NVARCHAR(50) NOT NULL DEFAULT 'Not Required',
        validated_by INT NULL,
        validated_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 12. InvoiceLineItems table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvoiceLineItems')
BEGIN
    CREATE TABLE InvoiceLineItems (
        line_item_id INT IDENTITY(1,1) PRIMARY KEY,
        invoice_id INT NOT NULL,
        waybill_id INT NULL,
        description NVARCHAR(500) NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        line_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_InvoiceLineItems_Invoice ON InvoiceLineItems(invoice_id);
END
GO

-- 13. InvoiceComputations table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvoiceComputations')
BEGIN
    CREATE TABLE InvoiceComputations (
        computation_id INT IDENTITY(1,1) PRIMARY KEY,
        invoice_id INT NOT NULL,
        subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        vat_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        computed_by INT NULL,
        computed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_InvoiceComputations_Invoice ON InvoiceComputations(invoice_id);
END
GO

-- 14. OfficialReceipts alignment
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'or_id')
BEGIN
    ALTER TABLE OfficialReceipts ADD or_id INT NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'invoice_id')
BEGIN
    ALTER TABLE OfficialReceipts ADD invoice_id INT NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'payment_id')
BEGIN
    ALTER TABLE OfficialReceipts ADD payment_id INT NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'client_id')
BEGIN
    ALTER TABLE OfficialReceipts ADD client_id INT NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'or_number')
BEGIN
    ALTER TABLE OfficialReceipts ADD or_number NVARCHAR(100) NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'issued_amount')
BEGIN
    ALTER TABLE OfficialReceipts ADD issued_amount DECIMAL(18,2) NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'issued_by')
BEGIN
    ALTER TABLE OfficialReceipts ADD issued_by NVARCHAR(100) NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'issued_at')
BEGIN
    ALTER TABLE OfficialReceipts ADD issued_at DATETIME2 NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'pdf_path')
BEGIN
    ALTER TABLE OfficialReceipts ADD pdf_path NVARCHAR(500) NULL;
END
GO
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OfficialReceipts' AND COLUMN_NAME = 'status')
BEGIN
    ALTER TABLE OfficialReceipts ADD status NVARCHAR(50) NULL;
END
GO

-- 15. CashInflows table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashInflows')
BEGIN
    CREATE TABLE CashInflows (
        inflow_id INT IDENTITY(1,1) PRIMARY KEY,
        payment_id INT NULL,
        client_id INT NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        source NVARCHAR(100) NULL DEFAULT 'Client Payment',
        reference_number NVARCHAR(100) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Validated',
        transaction_date DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 16. CashOutflows table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashOutflows')
BEGIN
    CREATE TABLE CashOutflows (
        outflow_id INT IDENTITY(1,1) PRIMARY KEY,
        category NVARCHAR(100) NULL,
        description NVARCHAR(255) NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        approved_by INT NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Approved',
        transaction_date DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 17. CashAdvances table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashAdvances')
BEGIN
    CREATE TABLE CashAdvances (
        cash_advance_id INT IDENTITY(1,1) PRIMARY KEY,
        employee_id INT NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        purpose NVARCHAR(500) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Approval',
        approved_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 18. Liquidations table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Liquidations')
BEGIN
    CREATE TABLE Liquidations (
        liquidation_id INT IDENTITY(1,1) PRIMARY KEY,
        reference_number NVARCHAR(100) NULL,
        cash_advance_id INT NULL,
        submitted_by INT NULL,
        submitted_by_name NVARCHAR(150) NULL,
        total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        leftover_cash DECIMAL(18,2) NULL DEFAULT 0.00,
        reimbursement_amount DECIMAL(18,2) NULL DEFAULT 0.00,
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        validated_by INT NULL,
        validated_at DATETIME2 NULL,
        date_submitted DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 19. LiquidationLineItems table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LiquidationLineItems')
BEGIN
    CREATE TABLE LiquidationLineItems (
        line_item_id INT IDENTITY(1,1) PRIMARY KEY,
        liquidation_id INT NOT NULL,
        description NVARCHAR(255) NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        receipt_attached BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 20. LiquidationDocuments table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LiquidationDocuments')
BEGIN
    CREATE TABLE LiquidationDocuments (
        document_id INT IDENTITY(1,1) PRIMARY KEY,
        liquidation_id INT NOT NULL,
        document_type NVARCHAR(100) NULL,
        file_path NVARCHAR(500) NULL,
        uploaded_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 21. FinancialAdjustments table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FinancialAdjustments')
BEGIN
    CREATE TABLE FinancialAdjustments (
        adjustment_id INT IDENTITY(1,1) PRIMARY KEY,
        invoice_id INT NULL,
        client_id INT NULL,
        adjustment_type NVARCHAR(50) NULL DEFAULT 'Adjustment',
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        reason NVARCHAR(500) NULL,
        requested_by INT NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Approval',
        approved_by INT NULL,
        approved_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 22. CreditMemos table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CreditMemos')
BEGIN
    CREATE TABLE CreditMemos (
        credit_memo_id INT IDENTITY(1,1) PRIMARY KEY,
        invoice_id INT NULL,
        client_id INT NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        reason NVARCHAR(500) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Approval',
        approved_by INT NULL,
        approved_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 23. RefundRequests table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RefundRequests')
BEGIN
    CREATE TABLE RefundRequests (
        refund_id INT IDENTITY(1,1) PRIMARY KEY,
        payment_id INT NULL,
        client_id INT NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        reason NVARCHAR(500) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Approval',
        processed_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 24. Settlements table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Settlements')
BEGIN
    CREATE TABLE Settlements (
        settlement_id INT IDENTITY(1,1) PRIMARY KEY,
        record_type NVARCHAR(100) NULL DEFAULT 'Settlement',
        courier_trip NVARCHAR(150) NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        submitted_by INT NULL,
        submitted_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        validated_by INT NULL,
        validated_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 25. AIReviewHistory table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AIReviewHistory')
BEGIN
    CREATE TABLE AIReviewHistory (
        review_id INT IDENTITY(1,1) PRIMARY KEY,
        document_number NVARCHAR(100) NULL,
        final_decision NVARCHAR(100) NULL,
        reviewer NVARCHAR(100) NULL,
        decision_reason NVARCHAR(500) NULL,
        reviewed_date DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 26. AIOutputHistory table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AIOutputHistory')
BEGIN
    CREATE TABLE AIOutputHistory (
        output_id INT IDENTITY(1,1) PRIMARY KEY,
        output_type NVARCHAR(100) NULL,
        source_reference NVARCHAR(100) NULL,
        processing_status NVARCHAR(100) NULL,
        model_name NVARCHAR(100) NULL,
        version NVARCHAR(50) NULL,
        message NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 27. Reports table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Reports')
BEGIN
    CREATE TABLE Reports (
        report_id INT IDENTITY(1,1) PRIMARY KEY,
        report_code NVARCHAR(50) NOT NULL UNIQUE,
        report_name NVARCHAR(200) NOT NULL,
        report_type NVARCHAR(100) NOT NULL,
        category NVARCHAR(100) NULL DEFAULT 'Financial',
        date_from DATETIME2 NULL,
        date_to DATETIME2 NULL,
        generated_by NVARCHAR(100) NOT NULL,
        generated_by_role NVARCHAR(100) NULL,
        record_count INT NOT NULL DEFAULT 0,
        total_amount DECIMAL(18,2) NULL DEFAULT 0.00,
        file_format NVARCHAR(20) NULL DEFAULT 'PDF',
        download_url NVARCHAR(500) NULL,
        summary_notes NVARCHAR(MAX) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Generated',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        is_deleted BIT NOT NULL DEFAULT 0
    );
    CREATE INDEX IX_Reports_Type ON Reports(report_type);
    CREATE INDEX IX_Reports_CreatedAt ON Reports(created_at);
END
GO

IF NOT EXISTS (SELECT 1 FROM Reports WHERE report_code = 'REP-2026-0001')
BEGIN
    INSERT INTO Reports (report_code, report_name, report_type, category, date_from, date_to, generated_by, generated_by_role, record_count, total_amount, file_format, summary_notes, status, created_at)
    VALUES 
    ('REP-2026-0001', 'Accounts Receivable Aging Report', 'aging', 'Financial', '2026-01-01', '2026-10-16', 'Crystalyn Joyce C. Fajardo', 'Financial Manager', 6, 82957.20, 'PDF', 'Comprehensive aged receivables report covering 1-30, 31-60, 61-90, and 90+ day overdue buckets.', 'Generated', DATEADD(HOUR, -2, SYSUTCDATETIME())),
    ('REP-2026-0002', 'Daily Collection Summary Report', 'collections', 'Financial', '2026-10-01', '2026-10-16', 'Crystalyn Joyce C. Fajardo', 'Financial Manager', 12, 145800.00, 'PDF', 'Consolidated collection summary from SpeedPay and direct bank settlements.', 'Generated', DATEADD(HOUR, -8, SYSUTCDATETIME())),
    ('REP-2026-0003', 'Official Invoices & Billing Summary', 'invoices', 'Financial', '2026-09-01', '2026-10-16', 'Head Accountant', 'Head Accountant', 7, 237957.20, 'Excel', 'Verified client billing statement across Shopee, Lazada, and corporate clients.', 'Generated', DATEADD(DAY, -1, SYSUTCDATETIME())),
    ('REP-2026-0004', 'AI Duplicate Alert & OCR Audit Summary', 'duplicate', 'Duplicate Detection', '2026-10-01', '2026-10-16', 'Assistant Financial Manager', 'Assistant FM', 16, 0.00, 'PDF', 'AI-assisted OCR duplicate detection and perceptual hash comparison audit.', 'Generated', DATEADD(DAY, -2, SYSUTCDATETIME())),
    ('REP-2026-0005', 'Courier Liquidation Validation Report', 'liquidations', 'Liquidation', '2026-10-01', '2026-10-16', 'Assistant Financial Manager', 'Assistant FM', 4, 18450.00, 'PDF', 'Disbursement liquidation validation covering fuel, toll, and operational advances.', 'Generated', DATEADD(DAY, -3, SYSUTCDATETIME())),
    ('REP-2026-0006', 'Executive Cash Flow & Treasury Ledger', 'cash-flow', 'Financial', '2026-01-01', '2026-10-16', 'Crystalyn Joyce C. Fajardo', 'Financial Manager', 28, 520000.00, 'PDF', 'Net operational cash inflow vs outflow reconciliation for Q3-Q4 2026.', 'Generated', DATEADD(DAY, -5, SYSUTCDATETIME()));
END
GO

PRINT 'All FOMS_DB tables and columns checked/created successfully.';
GO
