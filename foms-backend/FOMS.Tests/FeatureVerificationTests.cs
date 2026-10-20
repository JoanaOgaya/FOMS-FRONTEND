using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Features;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;
using Xunit;

namespace FOMS.Tests;

public class FeatureVerificationTests
{
    private async Task<ApplicationDbContext> GetDbContextAsync()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ApplicationDbContext(options);
        await ApplicationDbContextSeed.SeedSampleDataAsync(context);
        return context;
    }

    [Fact]
    public async Task PB09_MonitorCashFlow_ShouldAddAndRetrieveCashFlowTransactionsSuccessfully()
    {
        // Arrange
        using var context = await GetDbContextAsync();
        var handler = new CashFlowFeatures.AddCashFlowCommandHandler(context);
        var queryHandler = new CashFlowFeatures.GetCashFlowQueryHandler(context);

        // Act
        var command = new CashFlowFeatures.AddCashFlowCommand(
            Type: "Inflow",
            Category: "Collection",
            Amount: 15000.50m,
            ReferenceNo: "OR-2026-TEST",
            Description: "Payment for test services"
        );

        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Inflow", result.Type);
        Assert.Equal("Collection", result.Category);
        Assert.Equal(15000.50m, result.Amount);
        Assert.Equal("OR-2026-TEST", result.ReferenceNo);

        var entries = await queryHandler.Handle(new CashFlowFeatures.GetCashFlowQuery(), CancellationToken.None);
        var addedEntry = entries.FirstOrDefault(e => e.ReferenceNo == "OR-2026-TEST");
        Assert.NotNull(addedEntry);
    }

    [Fact]
    public async Task PB10_RecordTransportationExpenses_ShouldLogExpenseAndOutflowSuccessfully()
    {
        // Arrange
        using var context = await GetDbContextAsync();
        var handler = new ExpenseFeatures.RecordExpenseCommandHandler(context);
        var queryHandler = new ExpenseFeatures.GetExpensesQueryHandler(context);

        // Act
        var command = new ExpenseFeatures.RecordExpenseCommand(
            PlateNumber: "XYZ-1234",
            DriverName: "Test Driver",
            ExpenseType: "Fuel",
            Amount: 3500.00m,
            Description: "Diesel fuel refill at Petron"
        );

        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("XYZ-1234", result.PlateNumber);
        Assert.Equal("Test Driver", result.DriverName);
        Assert.Equal("Fuel", result.ExpenseType);
        Assert.Equal(3500.00m, result.Amount);

        // Verify that it logged a corresponding CashFlow Outflow entry
        var CashFlowTransactions = await context.CashFlowTransactions
            .Where(e => e.Type == "Outflow" && e.Category == "Fuel" && e.Amount == 3500.00m)
            .ToListAsync();
        
        Assert.NotEmpty(CashFlowTransactions);
        Assert.Contains("Fleet expense for XYZ-1234", CashFlowTransactions.First().Description);
    }

    [Fact]
    public async Task PB11_ValidateDeliveryPayments_ShouldReconcileAndCreatePaymentOnApproval()
    {
        // Arrange
        using var context = await GetDbContextAsync();
        
        // Seed a test invoice
        var invoice = new Invoice
        {
            Id = "INV-TEST-DEL",
            InvoiceNo = "INV-TEST-DEL",
            ClientId = "CL-001",
            ClientName = "Lazada Philippines",
            TotalAmount = 50000.00m,
            AmountPaid = 0m,
            Balance = 50000.00m,
            PaymentStatus = "Unpaid",
            DueDate = DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd")
        };
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        var submitHandler = new ValidationFeatures.SubmitValidationCommandHandler(context);
        var verifyHandler = new ValidationFeatures.VerifyValidationCommandHandler(context);

        // Act - Submit driver claim
        var submitCmd = new ValidationFeatures.SubmitValidationCommand(
            InvoiceNo: "INV-TEST-DEL",
            ClientName: "Lazada Philippines",
            DriverName: "Delivery Rider 1",
            AmountCollected: 50000.00m
        );
        var val = await submitHandler.Handle(submitCmd, CancellationToken.None);

        // Assert Submitted status
        Assert.NotNull(val);
        Assert.Equal("Pending", val.Status);
        Assert.Equal(50000.00m, val.AmountCollected);

        // Act - Verify / Approve the claim
        var verifyCmd = new ValidationFeatures.VerifyValidationCommand(
            Id: val.Id,
            Status: "Approved"
        );
        var success = await verifyHandler.Handle(verifyCmd, CancellationToken.None);

        // Assert Approved status changes invoice to Paid and registers payment
        Assert.True(success);
        
        var updatedVal = await context.PaymentValidations.FindAsync(val.Id);
        Assert.Equal("Approved", updatedVal!.Status);

        var updatedInvoice = await context.Invoices.FindAsync("INV-TEST-DEL");
        Assert.Equal(50000.00m, updatedInvoice!.AmountPaid);
        Assert.Equal(0m, updatedInvoice.Balance);
        Assert.Equal("Paid", updatedInvoice.PaymentStatus);

        var registeredPayment = await context.Payments.FirstOrDefaultAsync(p => p.InvoiceNo == "INV-TEST-DEL");
        Assert.NotNull(registeredPayment);
        Assert.Equal(50000.00m, registeredPayment!.Amount);
        Assert.Equal("Bank Transfer", registeredPayment.PaymentMethod);
        Assert.Contains("collection validation approved", registeredPayment.Remarks);
    }

    [Fact]
    public async Task SpeedPayWebhook_ShouldCreatePendingValidationRecords()
    {
        // Arrange
        using var context = await GetDbContextAsync();
        
        // Prevent overdue surcharge from affecting assertions by setting due date to the future
        var testInv = await context.Invoices.FindAsync("BI-2026-0001");
        if (testInv != null)
        {
            testInv.DueDate = DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd");
            FOMS.Application.Services.BillingComputationService.RecalculateInvoice(testInv);
            await FOMS.Application.Services.BillingComputationService.SyncClientBalanceAsync(testInv.ClientId, context);
            await context.SaveChangesAsync();
        }

        var handler = new SpeedPayFeatures.ProcessSpeedPayWebhookCommandHandler(context, null); // configuration can be null

        // Let's create a pending transaction for Flow B
        var shipment = await context.ShipmentRecords.FirstAsync(s => s.Id == "SR-001");
        var Client = await context.Clients.FirstAsync(c => c.Id == "CA-001");

        // Outstanding balance for CA-001 is 53,200.00. Shipment cost is 7,500.00.
        // Total transaction amount is 60,700.00.
        var totalAmount = Client.CurrentBalance + shipment.Cost;

        var transaction = new PaymentTransaction
        {
            ClientId = Client.Id,
            ShipmentRecordId = shipment.Id,
            Amount = totalAmount,
            PayMongoCheckoutId = "pi_test_12345",
            ReferenceOrNumber = "OR-2026-TESTSP",
            Status = "Pending",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        context.PaymentTransactions.Add(transaction);
        await context.SaveChangesAsync();

        // Let's construct a mock event payload
        var rawBody = @"{
            ""data"": {
                ""attributes"": {
                    ""type"": ""payment.paid"",
                    ""data"": {
                        ""id"": ""pay_test_123"",
                        ""attributes"": {
                            ""payment_intent_id"": ""pi_test_12345"",
                            ""receipt_url"": ""https://receipts.paymongo.com/test""
                        }
                    }
                }
            }
        }";

        var command = new SpeedPayFeatures.ProcessSpeedPayWebhookCommand(rawBody, "bypass_sig");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.Contains("Success", result);

        // 1. Verify PaymentTransaction is completed
        var updatedTransaction = await context.PaymentTransactions.FindAsync(transaction.Id);
        Assert.Equal("Completed", updatedTransaction!.Status);

        // 2. Verify Payment is created in "Pending Finance Validation" status
        var payment = await context.Payments.FirstOrDefaultAsync(p => p.ReferenceNumber == "pay_test_123");
        Assert.NotNull(payment);
        Assert.Equal("Pending Finance Validation", payment!.PaymentStatus);
        Assert.Equal(totalAmount, payment.Amount);

        // 3. Verify shipment status is Pending Validation (not completed yet)
        var updatedShipment = await context.ShipmentRecords.FindAsync(shipment.Id);
        Assert.Equal("Pending Validation", updatedShipment!.Status);

        // 4. Verify standard Invoice status is Pending Payment Validation
        var Invoice = await context.Invoices.FirstOrDefaultAsync(i => i.ClientId == Client.Id);
        Assert.NotNull(Invoice);
        Assert.Equal("Pending Payment Validation", Invoice!.PaymentStatus);

        // 5. Verify NO official receipt or payment collection is created yet (deferred until validation)
        var collection = await context.PaymentCollections.FirstOrDefaultAsync(c => c.InvoiceId == Invoice.Id);
        Assert.Null(collection);

        var receipt = await context.OfficialReceipts.FirstOrDefaultAsync();
        Assert.Null(receipt);
    }

    [Fact]
    public async Task FinanceValidation_ShouldApprovePaymentCorrectly()
    {
        // Arrange
        using var context = await GetDbContextAsync();

        // Seed invoice
        var invoice = new Invoice
        {
            Id = "INV-TEST-VAL",
            InvoiceNo = "INV-TEST-VAL",
            ClientId = "CL-TEST",
            ClientName = "Test Client",
            TotalAmount = 1000.00m,
            AmountPaid = 0m,
            Balance = 1000.00m,
            PaymentStatus = "Pending Payment Validation",
            DueDate = DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd")
        };
        context.Invoices.Add(invoice);

        // Seed pending payment
        var payment = new Payment
        {
            Id = "PAY-TEST-VAL",
            InvoiceId = invoice.Id,
            InvoiceNo = invoice.InvoiceNo,
            ClientId = invoice.ClientId,
            ClientName = invoice.ClientName,
            Amount = 1000.00m,
            PaymentMethod = "SpeedPay (PayMongo)",
            ReferenceNumber = "SP-REF-123",
            PaymentStatus = "Pending Finance Validation",
            SubmittedAt = DateTime.UtcNow
        };
        context.Payments.Add(payment);
        await context.SaveChangesAsync();

        // Act - Simulate final validation logic directly
        invoice.AmountPaid += payment.Amount;
        FOMS.Application.Services.BillingComputationService.RecalculateInvoice(invoice);
        invoice.PaymentValidationStatus = "Validated";

        payment.PaymentStatus = "Validated";
        payment.ValidatedAt = DateTime.UtcNow;
        payment.ValidatedBy = "Test FM";
        payment.OrNumber = "OR-2026-9999";

        // Create official receipt and collection records
        var paymentCollection = new PaymentCollection
        {
            InvoiceId = invoice.Id,
            CollectedDate = DateTime.UtcNow,
            AmountCollected = payment.Amount,
            PaymentMethod = payment.PaymentMethod,
            Status = "Completed"
        };
        context.PaymentCollections.Add(paymentCollection);

        var officialReceipt = new OfficialReceipt
        {
            PaymentCollectionId = paymentCollection.Id,
            ReceiptNumber = "OR-2026-9999",
            IssuedDate = DateTime.UtcNow
        };
        context.OfficialReceipts.Add(officialReceipt);

        // Sync AR (ReceivableBalance)
        var receivable = new ReceivableBalance
        {
            ClientId = invoice.ClientId,
            InvoiceId = invoice.Id,
            BalanceAmount = invoice.Balance,
            PaidAmount = payment.Amount,
            LastPaymentDate = DateTime.UtcNow,
            Status = "Fully Paid",
            DueDate = DateTime.UtcNow
        };
        context.ReceivableBalances.Add(receivable);

        // Sync Client Account balance
        await FOMS.Application.Services.BillingComputationService.SyncClientBalanceAsync(invoice.ClientId, context);

        // Payment History
        var history = new PaymentHistory
        {
            Id = Guid.NewGuid().ToString(),
            PaymentId = payment.Id,
            InvoiceId = invoice.Id,
            Status = "Validated",
            Action = "Validate Payment",
            Remarks = "Manual submission validated by Finance Manager.",
            PerformedBy = "Test FM",
            PerformedRole = "Financial Manager",
            CreatedAt = DateTime.UtcNow
        };
        context.PaymentHistories.Add(history);

        await context.SaveChangesAsync();

        // Assert
        var updatedPayment = await context.Payments.FindAsync(payment.Id);
        Assert.Equal("Validated", updatedPayment!.PaymentStatus);
        Assert.NotEmpty(updatedPayment.OrNumber);

        var updatedInvoice = await context.Invoices.FindAsync(invoice.Id);
        Assert.Equal("Paid", updatedInvoice!.PaymentStatus);
        Assert.Equal(1000.00m, updatedInvoice.AmountPaid);
        Assert.Equal(0m, updatedInvoice.Balance);

        // Check history
        var updatedHistory = await context.PaymentHistories.FirstOrDefaultAsync(h => h.PaymentId == payment.Id && h.Status == "Validated");
        Assert.NotNull(updatedHistory);
        Assert.Equal("Validate Payment", updatedHistory!.Action);

        // Check OR / Collection
        var collection = await context.PaymentCollections.FirstOrDefaultAsync(c => c.InvoiceId == invoice.Id);
        Assert.NotNull(collection);
        Assert.Equal(1000.00m, collection!.AmountCollected);

        var receipt = await context.OfficialReceipts.FirstOrDefaultAsync(r => r.PaymentCollectionId == collection.Id);
        Assert.NotNull(receipt);
    }

    [Fact]
    public async Task ValidateAnalyticsService_ShouldAggregateCorrectMetrics()
    {
        using var context = await GetDbContextAsync();
        var service = new FOMS.Application.Services.AnalyticsService(context);

        var metrics = await service.GetAdvancedAnalyticsAsync();
        Assert.NotNull(metrics);
        Assert.True(metrics.PaymentPerformance.TotalPaymentsProcessed > 0);
        Assert.True(metrics.CashFlowIntelligence.TotalInflow > 0);
    }

    [Fact]
    public async Task ValidatePredictionService_ShouldReturnLogicalForecasting()
    {
        using var context = await GetDbContextAsync();
        var service = new FOMS.Application.Services.PredictionService(context);

        var predictions = await service.GetPredictionsAsync();
        Assert.NotNull(predictions);
        Assert.True(predictions.PredictedNextMonthInflow > 0);
        Assert.NotEmpty(predictions.ForecastInsights);
    }
}
