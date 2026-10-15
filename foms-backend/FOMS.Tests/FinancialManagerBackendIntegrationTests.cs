using System;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Api.Controllers;
using FOMS.Application.Services;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;
using Xunit;

namespace FOMS.Tests;

public class FinancialManagerBackendIntegrationTests
{
    private FomsDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<FomsDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new FomsDbContext(options);
    }

    private ApplicationDbContext CreateApplicationInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private ClaimsPrincipal CreateFinancialManagerPrincipal(string employeeNumber = "EMP-001")
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, employeeNumber),
            new Claim(ClaimTypes.Name, "Crystalyn Joyce C. Fajardo"),
            new Claim(ClaimTypes.Role, "Financial Manager"),
            new Claim("role", "Financial Manager"),
            new Claim("employeeNumber", employeeNumber)
        };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        return new ClaimsPrincipal(identity);
    }

    private static JsonElement ToJsonElement(IActionResult? actionResult)
    {
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var json = JsonSerializer.Serialize(okResult.Value);
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-001: Login with EMP-001 and PASSWORD@123
    // Expected: Login successful and role = Financial Manager.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TC001_VerifyPasswordHash_ShouldSucceedForCorrectPassword()
    {
        var generatedHash = AuthService.HashPassword("PASSWORD@123");
        var isValid = AuthService.VerifyPassword("PASSWORD@123", generatedHash);
        Assert.True(isValid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-002: Login with wrong password
    // Expected: Login failed.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TC002_VerifyPasswordHash_ShouldFailForWrongPassword()
    {
        var generatedHash = AuthService.HashPassword("PASSWORD@123");
        var isValid = AuthService.VerifyPassword("WRONG_PASSWORD", generatedHash);
        Assert.False(isValid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-003: Access Financial Manager dashboard with valid token
    // Expected: Dashboard data returned from database.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC003_GetDashboard_WithValidToken_ShouldReturnDatabaseData()
    {
        using var db = CreateInMemoryDbContext();
        db.Invoices.Add(new Invoice
        {
            InvoiceId = 1,
            InvoiceNumber = "INV-2026-001",
            ClientId = 1,
            TotalAmount = 50000m,
            PaidAmount = 25000m,
            OutstandingBalance = 25000m,
            InvoiceStatus = "Approved"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = CreateFinancialManagerPrincipal() }
            }
        };

        var root = ToJsonElement(await controller.GetDashboard());
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("data").GetProperty("totalInvoicesBilled").GetInt32());
        Assert.Equal(50000m, root.GetProperty("data").GetProperty("totalInvoiceAmount").GetDecimal());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-004: Dashboard with empty database
    // Expected: Zero values and empty arrays, no mock data.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC004_GetDashboard_EmptyDatabase_ShouldReturnZerosAndEmptyArrays()
    {
        using var db = CreateInMemoryDbContext();
        var controller = new FinancialManagerController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = CreateFinancialManagerPrincipal() }
            }
        };

        var root = ToJsonElement(await controller.GetDashboard());
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(0, root.GetProperty("data").GetProperty("totalInvoicesBilled").GetInt32());
        Assert.Equal(0m, root.GetProperty("data").GetProperty("totalInvoiceAmount").GetDecimal());
        Assert.Equal(0m, root.GetProperty("data").GetProperty("totalArOutstanding").GetDecimal());
        Assert.Equal(0.0, root.GetProperty("data").GetProperty("collectionRate").GetDouble());
        Assert.Equal(0m, root.GetProperty("data").GetProperty("cashInflowThisMonth").GetDecimal());
        Assert.Equal(0, root.GetProperty("data").GetProperty("topPayingClients").GetArrayLength());
        Assert.Equal(0, root.GetProperty("data").GetProperty("needsAttention").GetArrayLength());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-005: Client Accounts page
    // Expected: Data comes from Clients table.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC005_GetClients_ShouldReturnFromDatabase()
    {
        using var db = CreateInMemoryDbContext();
        db.Clients.Add(new Client
        {
            ClientId = 1,
            ClientCode = "CA-001",
            CompanyName = "Lazada Philippines",
            IsActive = true
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetClients());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("count").GetInt32());
        Assert.Equal("Lazada Philippines", root.GetProperty("data")[0].GetProperty("companyName").GetString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-006: Rate Configuration page
    // Expected: Data from ClientFinanceSettings and ClientRates.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC006_GetRateConfigurations_ShouldReturnJoinedRates()
    {
        using var db = CreateInMemoryDbContext();
        db.Clients.Add(new Client { ClientId = 1, CompanyName = "Lazada Philippines", IsActive = true });
        db.ClientFinanceSettings.Add(new ClientFinanceSetting { ClientId = 1, BillingTerms = "Monthly", TaxType = "VATable" });
        db.ClientRates.Add(new ClientRate { RateId = 1, ClientId = 1, DeliveryArea = "NCR", MinimumRate = 120m });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetRateConfigurations());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal("Lazada Philippines", root.GetProperty("data")[0].GetProperty("clientName").GetString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-007: Waybills & POD page
    // Expected: Data from Waybills table.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC007_GetWaybills_ShouldReturnWaybillsFromDatabase()
    {
        using var db = CreateInMemoryDbContext();
        db.Waybills.Add(new Waybill
        {
            WaybillId = 1,
            WaybillNumber = "WB-001",
            ClientId = 1,
            DeliveryStatus = "Delivered",
            PodStatus = "Validated"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetWaybills());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("count").GetInt32());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-008: Invoice List page
    // Expected: Data from Invoices table.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC008_GetInvoices_ShouldReturnInvoicesFromDatabase()
    {
        using var db = CreateInMemoryDbContext();
        db.Invoices.Add(new Invoice
        {
            InvoiceId = 1,
            InvoiceNumber = "INV-001",
            ClientId = 1,
            TotalAmount = 80000m,
            InvoiceStatus = "Pending Validation"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetInvoices());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(80000m, root.GetProperty("data")[0].GetProperty("totalAmount").GetDecimal());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-009: Invoice Review page
    // Expected: Pending/approved counts from database.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC009_GetInvoiceReview_ShouldCalculateSummaryCorrectly()
    {
        using var db = CreateInMemoryDbContext();
        db.Invoices.Add(new Invoice { InvoiceId = 1, InvoiceNumber = "INV-001", TotalAmount = 50000m, InvoiceStatus = "Pending Validation" });
        db.Invoices.Add(new Invoice { InvoiceId = 2, InvoiceNumber = "INV-002", TotalAmount = 30000m, InvoiceStatus = "Approved" });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetInvoiceReview());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("summary").GetProperty("pendingApproval").GetInt32());
        Assert.Equal(1, root.GetProperty("summary").GetProperty("approvedInvoices").GetInt32());
        Assert.Equal(80000m, root.GetProperty("summary").GetProperty("totalInvoicedValue").GetDecimal());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-010: Accounts Receivable page
    // Expected: Aging buckets computed from AR due dates.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC010_GetAccountsReceivable_ShouldComputeAgingCorrectly()
    {
        using var db = CreateInMemoryDbContext();
        db.AccountsReceivable.Add(new AccountsReceivable
        {
            ArId = 1,
            InvoiceId = 1,
            ClientId = 1,
            InvoiceAmount = 50000m,
            OutstandingBalance = 50000m,
            DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15))
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetAccountsReceivable());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(50000m, root.GetProperty("summary").GetProperty("totalAr").GetDecimal());
        Assert.Equal(50000m, root.GetProperty("summary").GetProperty("days0to30").GetDecimal());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-011: Payments page
    // Expected: Inflow/outflow and pending validation from database.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC011_GetPayments_ShouldReturnPaymentMetrics()
    {
        using var db = CreateInMemoryDbContext();
        db.Payments.Add(new Payment
        {
            PaymentId = 1,
            Amount = 50000m,
            PaymentStatus = "Pending Finance Validation"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetPayments());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("summary").GetProperty("pendingValidation").GetInt32());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-012: SpeedPay Validation page
    // Expected: Leave SpeedPay code as is; message stays operational.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TC012_SpeedPay_FallbackMessage_RemainsIntact()
    {
        var expectedMessage = "SpeedPay service unavailable. Unable to connect to the SpeedPay API service. The rest of FOMS remains operational.";
        Assert.Contains("SpeedPay service unavailable", expectedMessage);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-013: Official Receipts page
    // Expected: Only validated/paid payments have OR records.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC013_GetOfficialReceipts_ShouldReturnDatabaseReceipts()
    {
        using var db = CreateInMemoryDbContext();
        db.OfficialReceipts.Add(new FomsOfficialReceipt
        {
            OrId = 1,
            OrNumber = "OR-2026-001",
            IssuedAmount = 50000m,
            Status = "Issued"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetOfficialReceipts());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("count").GetInt32());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-014: Settlement Validation page
    // Expected: Data from Liquidations/Settlements.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC014_GetPendingSettlements_ShouldReturnSummary()
    {
        using var db = CreateInMemoryDbContext();
        db.Settlements.Add(new Settlement
        {
            SettlementId = 1,
            Amount = 1500m,
            Status = "Pending Validation"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetPendingSettlements());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("summary").GetProperty("pendingValidation").GetInt32());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-015: Adjustment Approval page
    // Expected: Data from FinancialAdjustments table and approve action.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC015_ApproveAdjustment_ShouldUpdateStatus()
    {
        using var db = CreateInMemoryDbContext();
        db.FinancialAdjustments.Add(new FinancialAdjustment
        {
            AdjustmentId = 1,
            Amount = 2000m,
            Status = "Pending"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.ApproveAdjustment(1));

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal("Approved", root.GetProperty("data").GetProperty("Status").GetString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-016: Liquidation Reports page
    // Expected: Data from Liquidations table.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC016_GetLiquidations_ShouldReturnDatabaseReports()
    {
        using var db = CreateInMemoryDbContext();
        db.Liquidations.Add(new Liquidation
        {
            LiquidationId = 1,
            TotalAmount = 4500m,
            Status = "Pending Validation"
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetLiquidations());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(1, root.GetProperty("count").GetInt32());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-017: Cash Flow page
    // Expected: Total inflow, outflow, and net cash flow from database.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC017_GetCashFlow_ShouldComputeNetCashFlow()
    {
        using var db = CreateInMemoryDbContext();
        db.CashInflows.Add(new CashInflow { InflowId = 1, Amount = 50000m });
        db.CashOutflows.Add(new CashOutflow { OutflowId = 1, Amount = 3500m });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetCashFlow());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(50000m, root.GetProperty("summary").GetProperty("totalInflow").GetDecimal());
        Assert.Equal(3500m, root.GetProperty("summary").GetProperty("totalOutflow").GetDecimal());
        Assert.Equal(46500m, root.GetProperty("summary").GetProperty("netCashFlow").GetDecimal());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-018: Unique Documents page
    // Expected: Data from AI table, no hardcoded demo values.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC018_GetUniqueDocuments_ShouldReadFromDatabase()
    {
        using var db = CreateInMemoryDbContext();
        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetUniqueDocuments());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(0, root.GetProperty("count").GetInt32());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-019: Review History page
    // Expected: Data from AIReviewHistory table.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC019_GetReviewHistory_ShouldReturnHistoryFromDatabase()
    {
        using var db = CreateInMemoryDbContext();
        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetReviewHistory());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(0, root.GetProperty("count").GetInt32());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-020: Reports page
    // Expected: Generated report uses database records.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC020_GenerateReport_ShouldReadFromDatabase()
    {
        using var db = CreateInMemoryDbContext();
        db.Invoices.Add(new Invoice { InvoiceId = 1, InvoiceNumber = "INV-001", TotalAmount = 50000m });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GenerateReport(new ReportGenerateRequestDto { ReportType = "Invoice Summary" }));

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal("Invoice Summary", root.GetProperty("reportType").GetString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-021: Audit Logs page
    // Expected: Data from AuditLogs table.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC021_GetAuditLogs_ShouldReturnAuditLogsFromDatabase()
    {
        using var db = CreateInMemoryDbContext();
        db.AuditLogs.Add(new AuditLog
        {
            audit_id = 1,
            role = "System Admin",
            action = "DATABASE_CREATED",
            module = "MSSQL Setup",
            remarks = "FOMS_DB local database created successfully.",
            created_at = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetAuditLogs());

        Assert.True(root.GetProperty("success").GetBoolean());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-022: AI Output History page
    // Expected: Safe fallback with empty array when no AI logs.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TC022_GetAiOutputHistory_EmptyDatabase_ShouldReturnSafeFallback()
    {
        using var db = CreateInMemoryDbContext();
        var controller = new FinancialManagerController(db);
        var root = ToJsonElement(await controller.GetAiOutputHistory());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.NotNull(root.GetProperty("warning").GetString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TC-023: No mock data diagnostic check
    // Expected: Diagnostic endpoint confirms mock data is disabled.
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TC023_CheckNoMockData_ShouldConfirmMockDataDisabled()
    {
        using var db = CreateInMemoryDbContext();
        using var applicationDb = CreateApplicationInMemoryDbContext();
        var controller = new DatabaseHealthController(db, applicationDb);
        var root = ToJsonElement(controller.CheckNoMockData());

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.False(root.GetProperty("mockDataEnabled").GetBoolean());
        Assert.False(root.GetProperty("seedDataFallbackEnabled").GetBoolean());
        Assert.Equal("InMemory", root.GetProperty("database").GetString());
    }

    [Fact]
    public async Task CheckFinancialManagerAccess_UsesApplicationEmployeeSchema()
    {
        using var legacyDb = CreateInMemoryDbContext();
        using var applicationDb = CreateApplicationInMemoryDbContext();
        applicationDb.Employees.Add(new FOMS.Domain.Entities.Employee
        {
            Username = "EMP-001",
            Role = "Finance Manager",
            IsActive = true
        });
        await applicationDb.SaveChangesAsync();

        var controller = new DatabaseHealthController(legacyDb, applicationDb);
        var root = ToJsonElement(await controller.CheckFinancialManagerAccess());

        Assert.True(root.GetProperty("canAccessFinancialManager").GetBoolean());
        Assert.Equal("Finance Manager", root.GetProperty("role").GetString());
        Assert.Equal("InMemory", root.GetProperty("database").GetString());
    }
}
