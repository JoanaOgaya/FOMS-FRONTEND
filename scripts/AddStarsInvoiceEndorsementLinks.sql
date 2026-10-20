-- =====================================================================
-- Migration: AddStarsInvoiceEndorsementLinks
-- Description: Creates the StarsInvoiceEndorsementLinks table to store
--              STARS endorsement task mappings, actual received dates,
--              and signed receiving document copy URLs per STARS-TO-FOMS.pdf.
-- Compatible with: Microsoft SQL Server & Azure SQL Database
-- =====================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StarsInvoiceEndorsementLinks' AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[StarsInvoiceEndorsementLinks] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [InvoiceNumber] NVARCHAR(100) NOT NULL,
        [StarsTaskId] NVARCHAR(100) NULL,
        [StarsTaskNumber] NVARCHAR(50) NULL,
        [Status] NVARCHAR(50) NOT NULL CONSTRAINT [DF_StarsInvoiceEndorsementLinks_Status] DEFAULT ('EndorsementRequested'),
        [ActualReceivedDate] DATETIME2(7) NULL,
        [SignedCopyUrl] NVARCHAR(1000) NULL,
        [DeliveryRemarks] NVARCHAR(1000) NULL,
        [CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_StarsInvoiceEndorsementLinks_CreatedAt] DEFAULT (SYSUTCDATETIME()),
        [UpdatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_StarsInvoiceEndorsementLinks_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_StarsInvoiceEndorsementLinks] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE UNIQUE NONCLUSTERED INDEX [IX_StarsInvoiceEndorsementLinks_InvoiceNumber]
        ON [dbo].[StarsInvoiceEndorsementLinks] ([InvoiceNumber] ASC);

    CREATE NONCLUSTERED INDEX [IX_StarsInvoiceEndorsementLinks_StarsTaskId]
        ON [dbo].[StarsInvoiceEndorsementLinks] ([StarsTaskId] ASC);

    PRINT 'Table StarsInvoiceEndorsementLinks created successfully.';
END
ELSE
BEGIN
    PRINT 'Table StarsInvoiceEndorsementLinks already exists.';
END
GO
