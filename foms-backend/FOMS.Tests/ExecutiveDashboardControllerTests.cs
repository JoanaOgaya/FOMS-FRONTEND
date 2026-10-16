using System.Security.Claims;
using System.Text.Json;
using FOMS.Api.Controllers;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FOMS.Tests;

public class ExecutiveDashboardControllerTests
{
    [Fact]
    public async Task Get_RejectsNonFinancialManager()
    {
        await using var appDb = CreateApplicationDbContext();
        await using var fomsDb = CreateFomsDbContext();
        var controller = CreateController(appDb, fomsDb, "Accountant");

        var result = await controller.Get(null);

        Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, ((ObjectResult)result).StatusCode);
    }

    [Fact]
    public async Task Get_ReturnsAggregatesForSelectedClient()
    {
        await using var appDb = CreateApplicationDbContext();
        await using var fomsDb = CreateFomsDbContext();
        appDb.Invoices.AddRange(
            new Invoice
            {
                Id = "invoice-a",
                InvoiceNo = "INV-001",
                ClientId = "client-a",
                ClientName = "Acme",
                DueDate = DateTime.UtcNow.AddDays(4).ToString("yyyy-MM-dd"),
                TotalAmount = 1000m,
                AmountPaid = 400m,
                Balance = 600m
            },
            new Invoice
            {
                Id = "invoice-b",
                InvoiceNo = "INV-002",
                ClientId = "client-b",
                ClientName = "Other Client",
                DueDate = DateTime.UtcNow.AddDays(4).ToString("yyyy-MM-dd"),
                TotalAmount = 500m,
                Balance = 500m
            });
        appDb.Payments.Add(new Payment
        {
            Id = "payment-a",
            ClientId = "client-a",
            ClientName = "Acme",
            Amount = 400m,
            Flow = "inflow",
            PaymentStatus = "Validated"
        });
        appDb.CashFlowTransactions.Add(new CashFlowTransaction
        {
            Id = "cashflow-in",
            TransactionDate = DateTime.UtcNow.Date,
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Type = "Inflow",
            Amount = 250m
        });
        appDb.AuditLogs.Add(new AuditLog
        {
            Id = "audit-current",
            LoggedAt = DateTime.UtcNow,
            UserId = "EMP-001",
            EntityName = "Invoice",
            EntityId = "invoice-a",
            Action = "Invoice approved",
            Details = "Invoice INV-001 was approved."
        });
        await appDb.SaveChangesAsync();

        var controller = CreateController(appDb, fomsDb, "Financial Manager");
        var result = await controller.Get("client-a");
        var json = JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(result).Value);
        using var document = JsonDocument.Parse(json);
        var data = document.RootElement.GetProperty("data");

        Assert.Equal(1, data.GetProperty("totalInvoicesBilled").GetInt32());
        Assert.Equal(1000m, data.GetProperty("totalInvoiceAmount").GetDecimal());
        Assert.Equal(400m, data.GetProperty("totalCollected").GetDecimal());
        Assert.Equal(600m, data.GetProperty("totalArOutstanding").GetDecimal());
        Assert.Equal(40d, data.GetProperty("collectionRate").GetDouble());
        Assert.Equal(1, data.GetProperty("accountsNearDueDate").GetInt32());
        Assert.Equal("Acme", data.GetProperty("nearDueAccounts")[0].GetProperty("clientName").GetString());
        Assert.Equal(250m, data.GetProperty("cashInflowThisMonth").GetDecimal());
        Assert.Contains(
            data.GetProperty("cashFlowAnalytics").EnumerateArray(),
            period => period.GetProperty("inflow").GetDecimal() == 250m);
        var recentActivity = data.GetProperty("recentActivity");
        Assert.Single(recentActivity.EnumerateArray());
        Assert.Equal("Invoice approved", recentActivity[0].GetProperty("action").GetString());
        Assert.Equal("EMP-001", recentActivity[0].GetProperty("userFullName").GetString());

        var auditPageResult = Assert.IsType<OkObjectResult>(await new AuditLogsController(fomsDb).GetAll());
        using var auditPageDocument = JsonDocument.Parse(JsonSerializer.Serialize(auditPageResult.Value));
        Assert.NotNull(auditPageDocument.RootElement);
    }

    private static ApplicationDbContext CreateApplicationDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private static FomsDbContext CreateFomsDbContext()
    {
        var options = new DbContextOptionsBuilder<FomsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new FomsDbContext(options);
    }

    private static ExecutiveDashboardController CreateController(
        ApplicationDbContext appDb,
        FomsDbContext fomsDb,
        string role)
    {
        var controller = new ExecutiveDashboardController(appDb, fomsDb);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    new[] { new Claim(ClaimTypes.Role, role) },
                    "TestAuth"))
            }
        };
        return controller;
    }
}
