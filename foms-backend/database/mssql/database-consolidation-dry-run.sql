SET NOCOUNT ON;

-- Read-only inventory and identity checks. This script performs no inserts,
-- updates, deletes, DDL, or credential output.

WITH LegacyTables(TableName) AS
(
    SELECT TableName
    FROM (VALUES
        ('Roles'), ('Users'), ('Clients'), ('ClientFinanceSettings'), ('ClientRates'),
        ('Invoices'), ('AccountsReceivable'), ('Payments'), ('PaymentHistory'),
        ('Notifications'), ('AuditLogs'), ('Waybills'), ('ProofOfDeliveries'),
        ('BillingDocuments'), ('InvoiceLineItems'), ('InvoiceComputations'),
        ('OfficialReceipts'), ('CashInflows'), ('CashOutflows'), ('CashAdvances'),
        ('Liquidations'), ('LiquidationLineItems'), ('LiquidationDocuments'),
        ('FinancialAdjustments'), ('CreditMemos'), ('RefundRequests'), ('Settlements'),
        ('AIReviewHistory'), ('AIOutputHistory')
    ) AS Names(TableName)
),
SourceCounts AS
(
    SELECT t.name AS TableName, SUM(p.rows) AS RecordCount
    FROM FOMS_Official.sys.tables AS t
    INNER JOIN FOMS_Official.sys.schemas AS s ON s.schema_id = t.schema_id
    INNER JOIN FOMS_Official.sys.partitions AS p
        ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    WHERE s.name = N'dbo'
    GROUP BY t.name
),
DestinationCounts AS
(
    SELECT t.name AS TableName, SUM(p.rows) AS RecordCount
    FROM FOMS_DB.sys.tables AS t
    INNER JOIN FOMS_DB.sys.schemas AS s ON s.schema_id = t.schema_id
    INNER JOIN FOMS_DB.sys.partitions AS p
        ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    WHERE s.name = N'dbo'
    GROUP BY t.name
)
SELECT
    N'Legacy table row counts (partition metadata)' AS CheckName,
    l.TableName AS Item,
    COALESCE(src.RecordCount, 0) AS SourceCount,
    COALESCE(dst.RecordCount, 0) AS DestinationCount
FROM LegacyTables AS l
LEFT JOIN SourceCounts AS src ON src.TableName = l.TableName
LEFT JOIN DestinationCounts AS dst ON dst.TableName = l.TableName
ORDER BY l.TableName;

WITH LegacyTables(TableName) AS
(
    SELECT TableName
    FROM (VALUES
        ('Roles'), ('Users'), ('Clients'), ('ClientFinanceSettings'), ('ClientRates'),
        ('Invoices'), ('AccountsReceivable'), ('Payments'), ('PaymentHistory'),
        ('Notifications'), ('AuditLogs'), ('Waybills'), ('ProofOfDeliveries'),
        ('BillingDocuments'), ('InvoiceLineItems'), ('InvoiceComputations'),
        ('OfficialReceipts'), ('CashInflows'), ('CashOutflows'), ('CashAdvances'),
        ('Liquidations'), ('LiquidationLineItems'), ('LiquidationDocuments'),
        ('FinancialAdjustments'), ('CreditMemos'), ('RefundRequests'), ('Settlements'),
        ('AIReviewHistory'), ('AIOutputHistory')
    ) AS Names(TableName)
)
SELECT
    N'Destination dbo table presence' AS CheckName,
    CASE WHEN t.name IS NULL THEN N'MISSING' ELSE N'PRESENT' END AS Item,
    COUNT(*) AS TableCount
FROM LegacyTables AS l
LEFT JOIN FOMS_DB.sys.tables AS t ON t.name = l.TableName
LEFT JOIN FOMS_DB.sys.schemas AS s ON s.schema_id = t.schema_id AND s.name = N'dbo'
WHERE t.name IS NULL OR s.name = N'dbo'
GROUP BY CASE WHEN t.name IS NULL THEN N'MISSING' ELSE N'PRESENT' END;

SELECT
    N'Users matched by normalized username' AS CheckName,
    COUNT_BIG(*) AS MatchCount
FROM FOMS_Official.dbo.Users AS src
INNER JOIN FOMS_DB.dbo.Employees AS dst
    ON UPPER(LTRIM(RTRIM(src.username))) = UPPER(LTRIM(RTRIM(dst.Username)))
UNION ALL
SELECT
    N'Matched users with differing password hashes',
    COUNT_BIG(*)
FROM FOMS_Official.dbo.Users AS src
INNER JOIN FOMS_DB.dbo.Employees AS dst
    ON UPPER(LTRIM(RTRIM(src.username))) = UPPER(LTRIM(RTRIM(dst.Username)))
WHERE ISNULL(src.password_hash, N'') <> ISNULL(dst.PasswordHash, N'')
UNION ALL
SELECT
    N'Matched users with role-label differences',
    COUNT_BIG(*)
FROM FOMS_Official.dbo.Users AS src
INNER JOIN FOMS_DB.dbo.Employees AS dst
    ON UPPER(LTRIM(RTRIM(src.username))) = UPPER(LTRIM(RTRIM(dst.Username)))
INNER JOIN FOMS_Official.dbo.Roles AS role ON role.role_id = src.role_id
WHERE UPPER(LTRIM(RTRIM(role.role_name))) <> UPPER(LTRIM(RTRIM(dst.Role)))
UNION ALL
SELECT
    N'Clients matched by DMS ID',
    COUNT_BIG(*)
FROM FOMS_Official.dbo.Clients AS src
INNER JOIN FOMS_DB.dbo.Clients AS dst
    ON NULLIF(LTRIM(RTRIM(src.dms_client_id)), N'') =
       NULLIF(LTRIM(RTRIM(dst.DmsClientId)), N'')
UNION ALL
SELECT
    N'Clients matched by client code',
    COUNT_BIG(*)
FROM FOMS_Official.dbo.Clients AS src
INNER JOIN FOMS_DB.dbo.Clients AS dst
    ON NULLIF(LTRIM(RTRIM(src.client_code)), N'') =
       NULLIF(LTRIM(RTRIM(dst.ClientCode)), N'')
UNION ALL
SELECT
    N'Clients matched by normalized company/business name',
    COUNT_BIG(*)
FROM FOMS_Official.dbo.Clients AS src
INNER JOIN FOMS_DB.dbo.Clients AS dst
    ON UPPER(LTRIM(RTRIM(src.company_name))) =
       UPPER(LTRIM(RTRIM(dst.BusinessName)));

SELECT N'Users with missing legacy role', COUNT_BIG(*) AS OrphanCount
FROM FOMS_Official.dbo.Users AS u
LEFT JOIN FOMS_Official.dbo.Roles AS r ON r.role_id = u.role_id
WHERE r.role_id IS NULL
UNION ALL
SELECT N'Client finance settings with missing client', COUNT_BIG(*)
FROM FOMS_Official.dbo.ClientFinanceSettings AS settings
LEFT JOIN FOMS_Official.dbo.Clients AS c ON c.client_id = settings.client_id
WHERE c.client_id IS NULL
UNION ALL
SELECT N'Waybills with missing client', COUNT_BIG(*)
FROM FOMS_Official.dbo.Waybills AS w
LEFT JOIN FOMS_Official.dbo.Clients AS c ON c.client_id = w.client_id
WHERE c.client_id IS NULL
UNION ALL
SELECT N'Audit events with missing user', COUNT_BIG(*)
FROM FOMS_Official.dbo.AuditLogs AS audit
LEFT JOIN FOMS_Official.dbo.Users AS u ON u.user_id = audit.user_id
WHERE audit.user_id IS NOT NULL AND u.user_id IS NULL
UNION ALL
SELECT N'Settlements with missing submitter', COUNT_BIG(*)
FROM FOMS_Official.dbo.Settlements AS settlement
LEFT JOIN FOMS_Official.dbo.Users AS u ON u.user_id = settlement.submitted_by
WHERE settlement.submitted_by IS NOT NULL AND u.user_id IS NULL
UNION ALL
SELECT N'Settlements with missing validator', COUNT_BIG(*)
FROM FOMS_Official.dbo.Settlements AS settlement
LEFT JOIN FOMS_Official.dbo.Users AS u ON u.user_id = settlement.validated_by
WHERE settlement.validated_by IS NOT NULL AND u.user_id IS NULL
UNION ALL
SELECT N'Liquidations with missing cash advance', COUNT_BIG(*)
FROM FOMS_Official.dbo.Liquidations AS liquidation
LEFT JOIN FOMS_Official.dbo.CashAdvances AS advance
    ON advance.cash_advance_id = liquidation.cash_advance_id
WHERE liquidation.cash_advance_id IS NOT NULL AND advance.cash_advance_id IS NULL
UNION ALL
SELECT N'Liquidation line items with missing liquidation', COUNT_BIG(*)
FROM FOMS_Official.dbo.LiquidationLineItems AS item
LEFT JOIN FOMS_Official.dbo.Liquidations AS liquidation
    ON liquidation.liquidation_id = item.liquidation_id
WHERE liquidation.liquidation_id IS NULL;
