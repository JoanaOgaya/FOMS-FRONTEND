-- ============================================================================
-- FOMS (Finance Operations Management System) - MSSQL Official Schema
-- Database: FOMS_DB (Official Source of Truth)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'FOMS_DB')
BEGIN
    CREATE DATABASE FOMS_DB;
END
GO

USE FOMS_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Clients Table (Master source from DMS, read-only basic client info in FOMS)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Clients')
BEGIN
    CREATE TABLE Clients (
        client_id NVARCHAR(100) PRIMARY KEY,
        dms_client_id NVARCHAR(100) NOT NULL UNIQUE,
        client_code NVARCHAR(50) NOT NULL,
        company_name NVARCHAR(200) NOT NULL,
        address NVARCHAR(500) NOT NULL,
        contact_person NVARCHAR(150) NOT NULL,
        contact_number NVARCHAR(50) NOT NULL,
        email NVARCHAR(150) NOT NULL,
        dms_status NVARCHAR(50) NOT NULL DEFAULT 'Active',
        is_active BIT NOT NULL DEFAULT 1,
        synced_from_dms BIT NOT NULL DEFAULT 1,
        last_synced_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Clients_ClientCode ON Clients(client_code);
    CREATE INDEX IX_Clients_IsActive ON Clients(is_active);
END
GO

-- 2. ClientFinanceSettings Table (FOMS-owned financial settings for clients)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ClientFinanceSettings')
BEGIN
    CREATE TABLE ClientFinanceSettings (
        finance_setting_id NVARCHAR(100) PRIMARY KEY,
        client_id NVARCHAR(100) NOT NULL UNIQUE,
        billing_terms NVARCHAR(100) NOT NULL DEFAULT '30 Days',
        payment_terms NVARCHAR(100) NOT NULL DEFAULT 'Net 30',
        credit_terms_days INT NOT NULL DEFAULT 30,
        tax_type NVARCHAR(50) NOT NULL DEFAULT 'VAT Standard (12%)',
        withholding_tax_applicable BIT NOT NULL DEFAULT 0,
        default_rate_group NVARCHAR(100) NOT NULL DEFAULT 'STANDARD',
        oda_rate_applicable BIT NOT NULL DEFAULT 1,
        finance_status NVARCHAR(50) NOT NULL DEFAULT 'Active',
        created_by NVARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
        updated_by NVARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ClientFinanceSettings_Clients FOREIGN KEY (client_id) REFERENCES Clients(client_id) ON DELETE CASCADE
    );
END
GO

-- 3. ClientRates Table (Delivery rates, minimum rates, ODA rates, surcharges)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ClientRates')
BEGIN
    CREATE TABLE ClientRates (
        rate_id NVARCHAR(100) PRIMARY KEY,
        client_id NVARCHAR(100) NOT NULL,
        service_type NVARCHAR(100) NOT NULL,
        delivery_area NVARCHAR(100) NOT NULL,
        delivery_type NVARCHAR(100) NOT NULL DEFAULT 'Standard Delivery',
        minimum_kg DECIMAL(18,2) NOT NULL DEFAULT 5.00,
        minimum_rate DECIMAL(18,2) NOT NULL DEFAULT 100.00,
        excess_rate_per_kg DECIMAL(18,2) NOT NULL DEFAULT 25.00,
        oda_rate DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        fuel_surcharge_rate DECIMAL(18,4) NOT NULL DEFAULT 0.1500,
        valuation_rate DECIMAL(18,4) NOT NULL DEFAULT 0.0100,
        effective_from DATE NOT NULL,
        effective_to DATE NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ClientRates_Clients FOREIGN KEY (client_id) REFERENCES Clients(client_id)
    );
    CREATE INDEX IX_ClientRates_Area ON ClientRates(client_id, delivery_area, service_type, is_active);
END
GO

-- 4. Invoices Table (Official billing master records)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Invoices')
BEGIN
    CREATE TABLE Invoices (
        invoice_id NVARCHAR(100) PRIMARY KEY,
        invoice_no NVARCHAR(100) NOT NULL UNIQUE,
        client_id NVARCHAR(100) NOT NULL,
        client_name NVARCHAR(200) NOT NULL,
        billing_date DATE NOT NULL,
        due_date DATE NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        amount_paid DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        balance DECIMAL(18,2) NOT NULL,
        payment_status NVARCHAR(50) NOT NULL DEFAULT 'Unpaid',
        ctc_status NVARCHAR(50) NOT NULL DEFAULT 'Pending CTC',
        validation_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        notes NVARCHAR(MAX) NULL,
        created_by NVARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
        approved_by NVARCHAR(100) NULL,
        approved_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Invoices_Clients FOREIGN KEY (client_id) REFERENCES Clients(client_id)
    );
    CREATE INDEX IX_Invoices_Client ON Invoices(client_id);
    CREATE INDEX IX_Invoices_Status ON Invoices(payment_status, validation_status);
END
GO

-- 5. InvoiceComputations Table (Complete auditable breakdown of freight calculation)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvoiceComputations')
BEGIN
    CREATE TABLE InvoiceComputations (
        computation_id NVARCHAR(100) PRIMARY KEY,
        invoice_id NVARCHAR(100) NOT NULL,
        waybill_id NVARCHAR(100) NOT NULL,
        client_id NVARCHAR(100) NOT NULL,
        rate_id NVARCHAR(100) NOT NULL,
        area NVARCHAR(100) NOT NULL,
        actual_weight DECIMAL(18,2) NOT NULL,
        volume_weight DECIMAL(18,2) NOT NULL,
        chargeable_weight DECIMAL(18,2) NOT NULL,
        minimum_kg DECIMAL(18,2) NOT NULL,
        minimum_rate DECIMAL(18,2) NOT NULL,
        excess_rate_per_kg DECIMAL(18,2) NOT NULL,
        excess_weight DECIMAL(18,2) NOT NULL,
        freight_cost DECIMAL(18,2) NOT NULL,
        declared_value DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        valuation_rate DECIMAL(18,4) NOT NULL DEFAULT 0.00,
        valuation_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        is_oda BIT NOT NULL DEFAULT 0,
        oda_rate DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        oda_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        subtotal DECIMAL(18,2) NOT NULL,
        vat_rate DECIMAL(18,4) NOT NULL DEFAULT 0.1200,
        vat_amount DECIMAL(18,2) NOT NULL,
        fuel_surcharge_rate DECIMAL(18,4) NOT NULL DEFAULT 0.1500,
        fuel_surcharge_amount DECIMAL(18,2) NOT NULL,
        grand_total DECIMAL(18,2) NOT NULL,
        computation_json NVARCHAR(MAX) NOT NULL,
        computed_by NVARCHAR(100) NOT NULL,
        computed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_InvoiceComputations_Invoices FOREIGN KEY (invoice_id) REFERENCES Invoices(invoice_id)
    );
    CREATE INDEX IX_InvoiceComputations_Invoice ON InvoiceComputations(invoice_id);
END
GO

-- 6. BillingDocuments Table (Separate Validated Status vs CTC Status)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BillingDocuments')
BEGIN
    CREATE TABLE BillingDocuments (
        billing_document_id NVARCHAR(100) PRIMARY KEY,
        invoice_id NVARCHAR(100) NOT NULL,
        waybill_id NVARCHAR(100) NOT NULL,
        pod_status NVARCHAR(50) NOT NULL DEFAULT 'Delivered',
        validation_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        ctc_status NVARCHAR(50) NOT NULL DEFAULT 'Not Required',
        ctc_required BIT NOT NULL DEFAULT 0,
        validated_by NVARCHAR(100) NULL,
        validated_at DATETIME2 NULL,
        ctc_verified_by NVARCHAR(100) NULL,
        ctc_verified_at DATETIME2 NULL,
        remarks NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_BillingDocuments_Invoices FOREIGN KEY (invoice_id) REFERENCES Invoices(invoice_id)
    );
    CREATE INDEX IX_BillingDocs_Validation ON BillingDocuments(validation_status, ctc_status);
END
GO

-- 7. AccountsReceivable Table (Strict AR flow, zero and negative handling)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AccountsReceivable')
BEGIN
    CREATE TABLE AccountsReceivable (
        ar_id NVARCHAR(100) PRIMARY KEY,
        invoice_id NVARCHAR(100) NOT NULL UNIQUE,
        client_id NVARCHAR(100) NOT NULL,
        invoice_amount DECIMAL(18,2) NOT NULL,
        paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        outstanding_balance DECIMAL(18,2) NOT NULL,
        overpayment_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        ar_status NVARCHAR(50) NOT NULL DEFAULT 'Outstanding',
        due_date DATE NOT NULL,
        aging_bucket NVARCHAR(50) NOT NULL DEFAULT 'Current',
        last_payment_date DATE NULL,
        refund_status NVARCHAR(50) NOT NULL DEFAULT 'Not Required',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_AccountsReceivable_Invoices FOREIGN KEY (invoice_id) REFERENCES Invoices(invoice_id),
        CONSTRAINT FK_AccountsReceivable_Clients FOREIGN KEY (client_id) REFERENCES Clients(client_id)
    );
    CREATE INDEX IX_AR_Status ON AccountsReceivable(ar_status, aging_bucket);
    CREATE INDEX IX_AR_Client ON AccountsReceivable(client_id);
END
GO

-- 8. Payments Table (Official Payment Records)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Payments')
BEGIN
    CREATE TABLE Payments (
        payment_id NVARCHAR(100) PRIMARY KEY,
        or_number NVARCHAR(100) NOT NULL UNIQUE,
        invoice_id NVARCHAR(100) NOT NULL,
        invoice_no NVARCHAR(100) NOT NULL,
        client_id NVARCHAR(100) NOT NULL,
        client_name NVARCHAR(200) NOT NULL,
        payment_date DATE NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        payment_method NVARCHAR(100) NOT NULL,
        reference_number NVARCHAR(150) NOT NULL,
        proof_image_url NVARCHAR(500) NULL,
        remarks NVARCHAR(500) NULL,
        payment_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Finance Validation',
        recorded_by NVARCHAR(100) NOT NULL,
        date_recorded DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        validated_by NVARCHAR(100) NULL,
        validated_at DATETIME2 NULL,
        submitted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Payments_Invoices FOREIGN KEY (invoice_id) REFERENCES Invoices(invoice_id)
    );
    CREATE INDEX IX_Payments_Ref ON Payments(reference_number);
    CREATE INDEX IX_Payments_Status ON Payments(payment_status);
END
GO

-- 9. PaymentCustomerInfo Table (PayMongo Customer Validation: separated first & last name)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PaymentCustomerInfo')
BEGIN
    CREATE TABLE PaymentCustomerInfo (
        customer_info_id NVARCHAR(100) PRIMARY KEY,
        payment_id NVARCHAR(100) NOT NULL,
        first_name NVARCHAR(100) NOT NULL,
        last_name NVARCHAR(100) NOT NULL,
        email NVARCHAR(150) NOT NULL,
        phone NVARCHAR(50) NULL,
        full_name_generated AS (first_name + ' ' + last_name) PERSISTED,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_PaymentCustomerInfo_Payments FOREIGN KEY (payment_id) REFERENCES Payments(payment_id) ON DELETE CASCADE
    );
END
GO

-- 10. RefundRequests Table (Overpayments, DMS integration cases, finance approvals)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RefundRequests')
BEGIN
    CREATE TABLE RefundRequests (
        refund_id NVARCHAR(100) PRIMARY KEY,
        dms_case_id NVARCHAR(100) NULL,
        invoice_id NVARCHAR(100) NOT NULL,
        payment_id NVARCHAR(100) NOT NULL,
        ar_id NVARCHAR(100) NOT NULL,
        client_id NVARCHAR(100) NOT NULL,
        overpayment_amount DECIMAL(18,2) NOT NULL,
        refund_amount DECIMAL(18,2) NOT NULL,
        refund_reason NVARCHAR(500) NOT NULL,
        refund_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Finance Approval',
        requested_source NVARCHAR(100) NOT NULL DEFAULT 'System Overpayment Detection',
        requested_by NVARCHAR(100) NOT NULL,
        dms_validated_by NVARCHAR(100) NULL,
        finance_reviewed_by NVARCHAR(100) NULL,
        approved_by NVARCHAR(100) NULL,
        processed_by NVARCHAR(100) NULL,
        requested_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        dms_validated_at DATETIME2 NULL,
        finance_reviewed_at DATETIME2 NULL,
        approved_at DATETIME2 NULL,
        processed_at DATETIME2 NULL,
        remarks NVARCHAR(MAX) NULL,
        CONSTRAINT FK_RefundRequests_Invoices FOREIGN KEY (invoice_id) REFERENCES Invoices(invoice_id),
        CONSTRAINT FK_RefundRequests_Payments FOREIGN KEY (payment_id) REFERENCES Payments(payment_id),
        CONSTRAINT FK_RefundRequests_AR FOREIGN KEY (ar_id) REFERENCES AccountsReceivable(ar_id)
    );
    CREATE INDEX IX_RefundRequests_Status ON RefundRequests(refund_status);
END
GO

-- 11. CashFlowAccounts Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashFlowAccounts')
BEGIN
    CREATE TABLE CashFlowAccounts (
        account_id NVARCHAR(100) PRIMARY KEY,
        account_name NVARCHAR(150) NOT NULL,
        account_type NVARCHAR(50) NOT NULL, -- Operating, Petty Cash, Payroll, Bank
        maintaining_balance DECIMAL(18,2) NOT NULL DEFAULT 500.00,
        current_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 12. CashInflows Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashInflows')
BEGIN
    CREATE TABLE CashInflows (
        inflow_id NVARCHAR(100) PRIMARY KEY,
        account_id NVARCHAR(100) NOT NULL,
        source_type NVARCHAR(100) NOT NULL, -- Client Payment, Cash Advance Return, Bank Deposit
        source_reference_id NVARCHAR(100) NULL,
        description NVARCHAR(255) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        inflow_date DATE NOT NULL,
        validation_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        validated_by NVARCHAR(100) NULL,
        validated_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_CashInflows_Accounts FOREIGN KEY (account_id) REFERENCES CashFlowAccounts(account_id)
    );
    CREATE INDEX IX_CashInflows_AccountDate ON CashInflows(account_id, inflow_date);
END
GO

-- 13. CashOutflows Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashOutflows')
BEGIN
    CREATE TABLE CashOutflows (
        outflow_id NVARCHAR(100) PRIMARY KEY,
        account_id NVARCHAR(100) NOT NULL,
        source_type NVARCHAR(100) NOT NULL, -- Expense, Liquidation, Cash Advance Release
        source_reference_id NVARCHAR(100) NULL,
        expense_category NVARCHAR(100) NOT NULL, -- Travel, Fuel, Communication, Toll, Office Supplies, etc.
        description NVARCHAR(255) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        outflow_date DATE NOT NULL,
        validation_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        validated_by NVARCHAR(100) NULL,
        validated_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_CashOutflows_Accounts FOREIGN KEY (account_id) REFERENCES CashFlowAccounts(account_id)
    );
    CREATE INDEX IX_CashOutflows_AccountDate ON CashOutflows(account_id, outflow_date);
END
GO

-- 14. CashFlowSnapshots Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashFlowSnapshots')
BEGIN
    CREATE TABLE CashFlowSnapshots (
        snapshot_id NVARCHAR(100) PRIMARY KEY,
        account_id NVARCHAR(100) NOT NULL,
        beginning_balance DECIMAL(18,2) NOT NULL,
        total_inflows DECIMAL(18,2) NOT NULL,
        total_outflows DECIMAL(18,2) NOT NULL,
        net_cash_balance DECIMAL(18,2) NOT NULL,
        maintaining_balance DECIMAL(18,2) NOT NULL,
        variance DECIMAL(18,2) NOT NULL,
        snapshot_date DATE NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_CashFlowSnapshots_Accounts FOREIGN KEY (account_id) REFERENCES CashFlowAccounts(account_id)
    );
END
GO

-- 15. CashAdvances Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashAdvances')
BEGIN
    CREATE TABLE CashAdvances (
        cash_advance_id NVARCHAR(100) PRIMARY KEY,
        employee_id NVARCHAR(100) NOT NULL,
        request_date DATE NOT NULL,
        purpose NVARCHAR(500) NOT NULL,
        approved_amount DECIMAL(18,2) NOT NULL,
        released_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Approval',
        approved_by NVARCHAR(100) NULL,
        released_by NVARCHAR(100) NULL,
        released_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 16. CashAdvanceBreakdown Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CashAdvanceBreakdown')
BEGIN
    CREATE TABLE CashAdvanceBreakdown (
        breakdown_id NVARCHAR(100) PRIMARY KEY,
        cash_advance_id NVARCHAR(100) NOT NULL,
        category NVARCHAR(100) NOT NULL,
        estimated_amount DECIMAL(18,2) NOT NULL,
        remarks NVARCHAR(255) NULL,
        CONSTRAINT FK_CashAdvanceBreakdown_CA FOREIGN KEY (cash_advance_id) REFERENCES CashAdvances(cash_advance_id) ON DELETE CASCADE
    );
END
GO

-- 17. Liquidations Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Liquidations')
BEGIN
    CREATE TABLE Liquidations (
        liquidation_id NVARCHAR(100) PRIMARY KEY,
        cash_advance_id NVARCHAR(100) NOT NULL,
        employee_id NVARCHAR(100) NOT NULL,
        submission_date DATE NOT NULL,
        total_liquidated_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        returned_cash_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        reimbursement_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        variance_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        status NVARCHAR(50) NOT NULL DEFAULT 'Pending Review',
        reviewed_by NVARCHAR(100) NULL,
        approved_by NVARCHAR(100) NULL,
        remarks NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Liquidations_CA FOREIGN KEY (cash_advance_id) REFERENCES CashAdvances(cash_advance_id)
    );
END
GO

-- 18. LiquidationLineItems Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LiquidationLineItems')
BEGIN
    CREATE TABLE LiquidationLineItems (
        line_item_id NVARCHAR(100) PRIMARY KEY,
        liquidation_id NVARCHAR(100) NOT NULL,
        expense_category NVARCHAR(100) NOT NULL,
        description NVARCHAR(255) NOT NULL,
        receipt_number NVARCHAR(100) NOT NULL,
        receipt_date DATE NOT NULL,
        vendor_name NVARCHAR(150) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        deductible_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        supporting_document_status NVARCHAR(50) NOT NULL DEFAULT 'Verified',
        rejection_reason NVARCHAR(255) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_LiquidationLineItems_Liq FOREIGN KEY (liquidation_id) REFERENCES Liquidations(liquidation_id) ON DELETE CASCADE
    );
END
GO

-- 19. LiquidationDocuments Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LiquidationDocuments')
BEGIN
    CREATE TABLE LiquidationDocuments (
        document_id NVARCHAR(100) PRIMARY KEY,
        liquidation_id NVARCHAR(100) NOT NULL,
        document_type NVARCHAR(100) NOT NULL, -- Official Receipt, Voucher, Invoice, Check Copy
        file_name NVARCHAR(255) NOT NULL,
        file_path NVARCHAR(500) NOT NULL,
        validation_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Validation',
        remarks NVARCHAR(255) NULL,
        uploaded_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_LiquidationDocuments_Liq FOREIGN KEY (liquidation_id) REFERENCES Liquidations(liquidation_id) ON DELETE CASCADE
    );
END
GO

-- 20. UnidentifiedPayments Table (Hold / For Verification bank credits)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UnidentifiedPayments')
BEGIN
    CREATE TABLE UnidentifiedPayments (
        unidentified_payment_id NVARCHAR(100) PRIMARY KEY,
        amount DECIMAL(18,2) NOT NULL,
        received_date DATE NOT NULL,
        bank_reference NVARCHAR(150) NOT NULL,
        remarks NVARCHAR(500) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Hold / For Verification',
        claimed_by_client_id NVARCHAR(100) NULL,
        matched_invoice_id NVARCHAR(100) NULL,
        verified_by NVARCHAR(100) NULL,
        verified_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_UnidentifiedPayments_Clients FOREIGN KEY (claimed_by_client_id) REFERENCES Clients(client_id),
        CONSTRAINT FK_UnidentifiedPayments_Invoices FOREIGN KEY (matched_invoice_id) REFERENCES Invoices(invoice_id)
    );
END
GO

-- 21. BillingAdjustments Table (Discounts, Credit Memos, Cargo Damage Claims)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BillingAdjustments')
BEGIN
    CREATE TABLE BillingAdjustments (
        adjustment_id NVARCHAR(100) PRIMARY KEY,
        invoice_id NVARCHAR(100) NOT NULL,
        adjustment_type NVARCHAR(50) NOT NULL, -- Discount, Credit Memo, Damage Claim, Lost Cargo Credit
        amount DECIMAL(18,2) NOT NULL,
        percentage DECIMAL(5,2) NULL,
        reason NVARCHAR(500) NOT NULL,
        approval_status NVARCHAR(50) NOT NULL DEFAULT 'Pending Approval',
        approved_by NVARCHAR(100) NULL,
        approved_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_BillingAdjustments_Invoices FOREIGN KEY (invoice_id) REFERENCES Invoices(invoice_id)
    );
END
GO

-- 22. Notifications Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Notifications')
BEGIN
    CREATE TABLE Notifications (
        notification_id NVARCHAR(100) PRIMARY KEY,
        recipient_user_id NVARCHAR(100) NULL,
        recipient_role NVARCHAR(50) NOT NULL,
        type NVARCHAR(50) NOT NULL,
        title NVARCHAR(200) NOT NULL,
        message NVARCHAR(1000) NOT NULL,
        related_record_type NVARCHAR(50) NOT NULL,
        related_record_id NVARCHAR(100) NOT NULL,
        is_read BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_Notifications_Recipient ON Notifications(recipient_role, is_read, created_at);
END
GO

-- 23. AuditLogs Table (Comprehensive immutable audit trail)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLogs')
BEGIN
    CREATE TABLE AuditLogs (
        audit_id NVARCHAR(100) PRIMARY KEY,
        user_id NVARCHAR(100) NOT NULL,
        role NVARCHAR(50) NOT NULL,
        action NVARCHAR(100) NOT NULL,
        module NVARCHAR(100) NOT NULL,
        affected_record_type NVARCHAR(100) NOT NULL,
        affected_record_id NVARCHAR(100) NOT NULL,
        before_value NVARCHAR(MAX) NULL,
        after_value NVARCHAR(MAX) NULL,
        remarks NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AuditLogs_ModuleRecord ON AuditLogs(module, affected_record_type, affected_record_id);
    CREATE INDEX IX_AuditLogs_CreatedAt ON AuditLogs(created_at DESC);
END
GO

-- 24. Employees Table (FOMS Staff accounts)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Employees')
BEGIN
    CREATE TABLE Employees (
        employee_id NVARCHAR(100) PRIMARY KEY,
        name NVARCHAR(150) NOT NULL,
        role NVARCHAR(50) NOT NULL,
        email NVARCHAR(150) NOT NULL UNIQUE,
        system_access NVARCHAR(100) NOT NULL DEFAULT 'Finance Operation Service',
        status NVARCHAR(50) NOT NULL DEFAULT 'Active',
        is_active BIT NOT NULL DEFAULT 1,
        username NVARCHAR(100) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

PRINT 'MSSQL FOMS_DB tables and indexes created successfully.';
GO
