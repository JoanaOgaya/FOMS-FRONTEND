using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Features;
using FOMS.Application.Services;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;
using Xunit;

namespace FOMS.Tests;

public class FinancialComputationTests
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
    public void VAT_ShouldBeCalculatedAsTwelvePercentOfSubtotal()
    {
        // Arrange
        decimal subtotal = 10000.00m;
        decimal expectedVat = 1200.00m;

        // Act
        decimal actualVat = BillingComputationService.ComputeVat(subtotal);

        // Assert
        Assert.Equal(expectedVat, actualVat);
    }

    [Fact]
    public void OutstandingBalance_ShouldBeTotalMinusPaidAndNeverNegative()
    {
        // Act & Assert
        Assert.Equal(6000.00m, BillingComputationService.ComputeOutstandingBalance(10000.00m, 4000.00m));
        Assert.Equal(0.00m, BillingComputationService.ComputeOutstandingBalance(10000.00m, 10000.00m));
        Assert.Equal(0.00m, BillingComputationService.ComputeOutstandingBalance(10000.00m, 12000.00m)); // Overpayment balance is capped at 0
    }

    [Fact]
    public void OverpaymentAndInvalidPayments_ShouldBeRejectedByValidation()
    {
        // Act & Assert
        Assert.NotNull(BillingComputationService.ValidatePaymentAmount(11000.00m, 10000.00m)); // Overpayment rejection
        Assert.NotNull(BillingComputationService.ValidatePaymentAmount(0m, 10000.00m));       // Zero payment rejection
        Assert.NotNull(BillingComputationService.ValidatePaymentAmount(-500m, 10000.00m));     // Negative payment rejection
        Assert.Null(BillingComputationService.ValidatePaymentAmount(4000.00m, 10000.00m));     // Valid partial payment
        Assert.Null(BillingComputationService.ValidatePaymentAmount(10000.00m, 10000.00m));   // Valid full payment
    }

    [Fact]
    public void AgingBuckets_ShouldMapCorrectlyBasedOnDueDays()
    {
        // Arrange
        var today = DateTime.UtcNow.Date;
        
        var currentDueDate = today.AddDays(5).ToString("yyyy-MM-dd");
        var overdue10Days = today.AddDays(-10).ToString("yyyy-MM-dd");
        var overdue45Days = today.AddDays(-45).ToString("yyyy-MM-dd");
        var overdue75Days = today.AddDays(-75).ToString("yyyy-MM-dd");
        var overdue100Days = today.AddDays(-100).ToString("yyyy-MM-dd");

        // Act & Assert
        Assert.Equal("Current", BillingComputationService.ComputeAgingBucket(currentDueDate));
        Assert.Equal("1-30", BillingComputationService.ComputeAgingBucket(overdue10Days));
        Assert.Equal("31-60", BillingComputationService.ComputeAgingBucket(overdue45Days));
        Assert.Equal("61-90", BillingComputationService.ComputeAgingBucket(overdue75Days));
        Assert.Equal("90+", BillingComputationService.ComputeAgingBucket(overdue100Days));
    }

    [Fact]
    public void PaymentStatus_ShouldUpdateCorrectlyBasedOnBalancePaidAndDueDate()
    {
        // Arrange
        var today = DateTime.UtcNow.Date;
        var futureDue = today.AddDays(10).ToString("yyyy-MM-dd");
        var pastDue = today.AddDays(-10).ToString("yyyy-MM-dd");

        // Act & Assert
        Assert.Equal("Paid", BillingComputationService.ComputePaymentStatus(0m, 10000.00m, futureDue));
        Assert.Equal("Unpaid", BillingComputationService.ComputePaymentStatus(10000.00m, 0m, futureDue));
        Assert.Equal("Unpaid", BillingComputationService.ComputePaymentStatus(6000.00m, 4000.00m, futureDue));
        Assert.Equal("Overdue", BillingComputationService.ComputePaymentStatus(10000.00m, 0m, pastDue));
        Assert.Equal("Overdue", BillingComputationService.ComputePaymentStatus(6000.00m, 4000.00m, pastDue));
    }

    [Fact]
    public async Task RecordPaymentCommandHandler_ShouldSupportPartialPaymentsAndHardenGuards()
    {
        // Arrange
        using var context = await GetDbContextAsync();
        var handler = new PaymentFeatures.RecordPaymentCommandHandler(context);

        // Retrieve seeded invoice LZD-2026-0001
        var invoice = await context.Invoices.FirstAsync(i => i.InvoiceNo == "LZD-2026-0001");
        // Normalize due date to the future to avoid overdue surcharge interfering with assertions
        invoice.DueDate = DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd");
        BillingComputationService.RecalculateInvoice(invoice);
        await context.SaveChangesAsync();

        decimal startingBalance = invoice.Balance; // Should be 53,200.00
        decimal paymentAmount = 20000.00m;

        // Act - Record partial payment
        var command = new PaymentFeatures.RecordPaymentCommand(
            OrNumber: "OR-PARTIAL-TEST",
            InvoiceId: invoice.Id,
            InvoiceNo: invoice.InvoiceNo,
            ClientId: invoice.ClientId,
            ClientName: invoice.ClientName,
            PaymentDate: DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Amount: paymentAmount,
            PaymentMethod: "GCash",
            ReferenceNumber: "GC-PARTIAL-123",
            ProofImageUrl: "http://example.com/proof.jpg",
            Remarks: "Test Partial Payment",
            RecordedBy: "Test User"
        );
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(paymentAmount, result.Amount);
        Assert.Equal("Pending Validation", result.PaymentStatus);
        var updatedInvoice = await context.Invoices.FindAsync(invoice.Id);
        Assert.NotNull(updatedInvoice);
        // Per business rules: Payment is pending validation, invoice amount paid updates only upon Finance validation
        Assert.Equal(0m, updatedInvoice!.AmountPaid);
        Assert.Equal(startingBalance, updatedInvoice.Balance);

        // Assert overpayment rejection
        var overpayCommand = command with { OrNumber = "OR-OVERPAY", Amount = startingBalance + 1.00m };
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(overpayCommand, CancellationToken.None));

        // Assert negative payment rejection
        var negativeCommand = command with { OrNumber = "OR-NEGATIVE", Amount = -100m };
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(negativeCommand, CancellationToken.None));

        // Assert zero payment rejection
        var zeroCommand = command with { OrNumber = "OR-ZERO", Amount = 0m };
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(zeroCommand, CancellationToken.None));
    }
}
