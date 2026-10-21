-- ============================================================================
-- STARS Collection Tasks & DMS Integration Database Schema Alignment
-- ============================================================================

USE FOMS_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Ensure Coordinator Role exists
IF NOT EXISTS (SELECT 1 FROM Roles WHERE role_name = 'Billing & Collection Coordinator' OR role_name = 'Coordinator')
BEGIN
    INSERT INTO Roles (Id, Name, Description, role_id, role_name, created_at)
    VALUES ('ROLE-005', 'Billing & Collection Coordinator', 'STARS Billing & Collection Coordinator', 5, 'Billing & Collection Coordinator', SYSUTCDATETIME());
END
GO

-- 2. Ensure Coordinators exist in Users table for Graph Routing Engine
IF NOT EXISTS (SELECT 1 FROM Users WHERE employee_number = 'EMP-006')
BEGIN
    -- Password hash for 'password123'
    INSERT INTO Users (employee_number, full_name, username, password_hash, role_id, is_active, created_at, updated_at)
    VALUES ('EMP-006', 'Joana Marie Chan Ogaya', 'coordinator.ogaya', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 5, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END
GO

IF NOT EXISTS (SELECT 1 FROM Users WHERE employee_number = 'EMP-007')
BEGIN
    INSERT INTO Users (employee_number, full_name, username, password_hash, role_id, is_active, created_at, updated_at)
    VALUES ('EMP-007', 'Mark Anthony Santos', 'coordinator.santos', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 5, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END
GO

-- 3. Create StarsCollectionTasks table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StarsCollectionTasks')
BEGIN
    CREATE TABLE StarsCollectionTasks (
        task_id INT IDENTITY(1,1) PRIMARY KEY,
        task_number NVARCHAR(100) NOT NULL UNIQUE,
        task_type NVARCHAR(100) NOT NULL DEFAULT 'Collection Follow-up',
        invoice_number NVARCHAR(100) NOT NULL,
        client_name NVARCHAR(200) NOT NULL,
        amount_due DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        days_overdue INT NOT NULL DEFAULT 0,
        assigned_coordinator_id NVARCHAR(100) NULL,
        assigned_coordinator_name NVARCHAR(200) NOT NULL,
        routing_score DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        routing_reason NVARCHAR(500) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Assigned',
        action_taken NVARCHAR(500) NULL,
        outcome NVARCHAR(100) NULL,
        promised_payment_date DATETIME2 NULL,
        execution_notes NVARCHAR(MAX) NULL,
        executed_at DATETIME2 NULL,
        executed_by NVARCHAR(200) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_StarsCollectionTasks_InvoiceNumber ON StarsCollectionTasks(invoice_number);
    CREATE INDEX IX_StarsCollectionTasks_Status ON StarsCollectionTasks(status);
    CREATE INDEX IX_StarsCollectionTasks_Coordinator ON StarsCollectionTasks(assigned_coordinator_id);
END
GO

-- 4. Ensure CashAdvances has approval and tracking columns
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CashAdvances' AND COLUMN_NAME = 'ApprovedBy')
BEGIN
    ALTER TABLE CashAdvances ADD ApprovedBy NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CashAdvances' AND COLUMN_NAME = 'ApprovedAt')
BEGIN
    ALTER TABLE CashAdvances ADD ApprovedAt DATETIME2 NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CashAdvances' AND COLUMN_NAME = 'DisbursedAt')
BEGIN
    ALTER TABLE CashAdvances ADD DisbursedAt DATETIME2 NULL;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CashAdvances' AND COLUMN_NAME = 'DisbursedBy')
BEGIN
    ALTER TABLE CashAdvances ADD DisbursedBy NVARCHAR(100) NULL;
END
GO

-- 5. Seed initial Cash Advances for testing and UI display
IF NOT EXISTS (SELECT 1 FROM CashAdvances WHERE AdvanceId = 'CA-2026-0001')
BEGIN
    INSERT INTO CashAdvances (AdvanceId, CourierName, TripReference, AmountGiven, ReleaseDate, ReleasedBy, Status, Notes, CreatedAt)
    VALUES ('CA-2026-0001', 'Juan Dela Cruz', 'TRIP-NCR-2026-001', 5000.00, SYSUTCDATETIME(), 'Ops Dispatcher', 'Approved', 'Fuel, toll, and route maintenance for NCR Run', SYSUTCDATETIME());

    INSERT INTO CashAdvances (AdvanceId, CourierName, TripReference, AmountGiven, ReleaseDate, ReleasedBy, Status, Notes, CreatedAt)
    VALUES ('CA-2026-0002', 'Pedro Santos', 'TRIP-LUZ-2026-002', 3500.00, SYSUTCDATETIME(), 'Ops Dispatcher', 'Pending Finance Review', 'Pampanga and Clark delivery run cash advance', SYSUTCDATETIME());

    INSERT INTO CashAdvances (AdvanceId, CourierName, TripReference, AmountGiven, ReleaseDate, ReleasedBy, Status, Notes, CreatedAt)
    VALUES ('CA-2026-0003', 'Carlos Reyes', 'TRIP-VIS-2026-003', 7000.00, SYSUTCDATETIME(), 'Finance Manager', 'Disbursed', 'Visayas logistics corridor operational advance', SYSUTCDATETIME());
END
GO

PRINT 'STARS Collection Tasks and DMS Integration tables verified successfully.';
GO
