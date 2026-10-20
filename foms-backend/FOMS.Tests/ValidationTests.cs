using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Features;
using FOMS.Application.Validators;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;
using Xunit;

namespace FOMS.Tests;

public class ValidationTests
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
    public async Task RecordPaymentCommandValidator_ShouldValidateCorrectly()
    {
        using var context = await GetDbContextAsync();
        var validator = new RecordPaymentCommandValidator(context);

        var invoice = await context.Invoices.FirstAsync(i => i.InvoiceNo == "LZD-2026-0001");
        invoice.DueDate = DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd");
        await context.SaveChangesAsync();

        // 1. Valid payment
        var validCommand = new PaymentFeatures.RecordPaymentCommand(
            OrNumber: "OR-NEW-UNIQUE-999",
            InvoiceId: invoice.Id,
            InvoiceNo: invoice.InvoiceNo,
            ClientId: invoice.ClientId,
            ClientName: invoice.ClientName,
            PaymentDate: "2026-06-16",
            Amount: 1000m,
            PaymentMethod: "GCash",
            ReferenceNumber: "GC-REF-UNIQUE-999",
            ProofImageUrl: "http://example.com/proof.jpg",
            Remarks: "Legit payment",
            RecordedBy: "Test User"
        );
        var result = await validator.ValidateAsync(validCommand);
        Assert.True(result.IsValid, string.Join(", ", result.Errors.Select(e => e.ErrorMessage)));

        // 2. Invalid negative amount
        var invalidAmount = validCommand with { Amount = -100m };
        var amountRes = await validator.ValidateAsync(invalidAmount);
        Assert.False(amountRes.IsValid);
        Assert.Contains(amountRes.Errors, e => e.PropertyName == "Amount");

        // 3. Exceeds outstanding balance
        var exceedsBalance = validCommand with { OrNumber = "OR-EXCEED", Amount = invoice.Balance + 1.00m };
        var exceedsRes = await validator.ValidateAsync(exceedsBalance);
        Assert.False(exceedsRes.IsValid);
        Assert.Contains(exceedsRes.Errors, e => e.PropertyName == "Amount");

        // 4. Invalid Payment Method
        var badMethod = validCommand with { OrNumber = "OR-METHOD", PaymentMethod = "BitCoin" };
        var methodRes = await validator.ValidateAsync(badMethod);
        Assert.False(methodRes.IsValid);
        Assert.Contains(methodRes.Errors, e => e.PropertyName == "PaymentMethod");

        // 5. Invalid Date Format
        var badDate = validCommand with { OrNumber = "OR-DATE", PaymentDate = "not-a-date" };
        var dateRes = await validator.ValidateAsync(badDate);
        Assert.False(dateRes.IsValid);
        Assert.Contains(dateRes.Errors, e => e.PropertyName == "PaymentDate");
    }

    [Fact]
    public async Task CreateInvoiceCommandValidator_ShouldValidateCorrectly()
    {
        using var context = await GetDbContextAsync();
        var validator = new CreateInvoiceCommandValidator(context);

        var client = await context.Clients.FirstAsync();

        // 1. Valid invoice
        var validCommand = new InvoiceFeatures.CreateInvoiceCommand(
            InvoiceNo: "BI-NEW-UNIQUE-999",
            ClientId: client.Id,
            ClientName: client.Name,
            BillingDate: "2026-06-16",
            DueDate: "2026-07-16",
            FreightCharges: 1000m,
            OtherCharges: 100m,
            Description: "New billing invoice",
            EncodedBy: "Test User"
        );
        var result = await validator.ValidateAsync(validCommand);
        Assert.True(result.IsValid, string.Join(", ", result.Errors.Select(e => e.ErrorMessage)));

        // 2. Due date before billing date
        var badDates = validCommand with { DueDate = "2026-05-16" };
        var datesRes = await validator.ValidateAsync(badDates);
        Assert.False(datesRes.IsValid);
        Assert.Contains(datesRes.Errors, e => e.PropertyName == "DueDate");

        // 3. Duplicate Invoice Number
        var duplicateNo = validCommand with { InvoiceNo = "LZD-2026-0001" };
        var dupRes = await validator.ValidateAsync(duplicateNo);
        Assert.False(dupRes.IsValid);
        Assert.Contains(dupRes.Errors, e => e.PropertyName == "InvoiceNo");
    }

    [Fact]
    public async Task CreateAdjustmentCommandValidator_ShouldValidateCorrectly()
    {
        using var context = await GetDbContextAsync();
        var validator = new CreateAdjustmentCommandValidator(context);

        var invoice = await context.Invoices.FirstAsync();

        // 1. Valid Credit adjustment
        var validCommand = new AdjustmentFeatures.CreateAdjustmentCommand(
            InvoiceNo: invoice.InvoiceNo,
            AdjustmentType: "Credit",
            Amount: 1000m,
            Reason: "Valid reason over 10 chars",
            AdjustedBy: "Test Accountant",
            ApprovedBy: "Test Accountant"
        );
        var result = await validator.ValidateAsync(validCommand);
        Assert.True(result.IsValid, string.Join(", ", result.Errors.Select(e => e.ErrorMessage)));

        // 2. Reason too short
        var shortReason = validCommand with { Reason = "short" };
        var reasonRes = await validator.ValidateAsync(shortReason);
        Assert.False(reasonRes.IsValid);
        Assert.Contains(reasonRes.Errors, e => e.PropertyName == "Reason");

        // 3. Invalid adjustment type
        var badType = validCommand with { AdjustmentType = "Refund" };
        var typeRes = await validator.ValidateAsync(badType);
        Assert.False(typeRes.IsValid);
        Assert.Contains(typeRes.Errors, e => e.PropertyName == "AdjustmentType");
    }

    [Fact]
    public async Task CreateClientCommandValidator_ShouldValidateCorrectly()
    {
        using var context = await GetDbContextAsync();
        var validator = new CreateClientCommandValidator(context);

        // 1. Valid client
        var validCommand = new ClientFeatures.CreateClientCommand(
            ClientCode: "CA-NEW-UNIQUE-999",
            Name: "New Client Ltd",
            BusinessName: "New Client Business",
            ContactPerson: "John Doe",
            ContactNumber: "0917-123-4567",
            Email: "newclient@foms.local",
            Address: "123 Street Manila",
            Tin: "123-456-789",
            CreditLimit: 100000m
        );
        var result = await validator.ValidateAsync(validCommand);
        Assert.True(result.IsValid, string.Join(", ", result.Errors.Select(e => e.ErrorMessage)));

        // 2. Duplicate Client Code
        var duplicateCode = validCommand with { ClientCode = "CA-001" };
        var codeRes = await validator.ValidateAsync(duplicateCode);
        Assert.False(codeRes.IsValid);
        Assert.Contains(codeRes.Errors, e => e.PropertyName == "ClientCode");

        // 3. Invalid Email Format
        var badEmail = validCommand with { ClientCode = "CA-EMAIL-TEST", Email = "not-an-email" };
        var emailRes = await validator.ValidateAsync(badEmail);
        Assert.False(emailRes.IsValid);
        Assert.Contains(emailRes.Errors, e => e.PropertyName == "Email");
    }

    [Fact]
    public async Task SpeedPayValidators_ShouldValidateCorrectly()
    {
        using var context = await GetDbContextAsync();
        var speedPayVal = new InitiateSpeedPayCheckoutCommandValidator(context);
        var invoiceVal = new InitiateInvoiceCheckoutCommandValidator(context);

        var client = await context.Clients.FirstAsync(c => c.Id == "CA-001");
        var shipment = await context.ShipmentRecords.FirstAsync(s => s.ClientId == "CA-001");

        // 1. Valid shipment checkout
        var validSpeedPay = new SpeedPayFeatures.InitiateSpeedPayCheckoutCommand(
            ClientId: client.Id,
            ShipmentId: shipment.Id,
            Amount: client.CurrentBalance + shipment.Cost,
            PaymentMethod: "gcash"
        );
        var speedPayResult = await speedPayVal.ValidateAsync(validSpeedPay);
        Assert.True(speedPayResult.IsValid, string.Join(", ", speedPayResult.Errors.Select(e => e.ErrorMessage)));

        // 2. Excess shipment payment amount
        var excessSpeedPay = validSpeedPay with { Amount = client.CurrentBalance + shipment.Cost + 10.00m };
        var excessSpeedPayRes = await speedPayVal.ValidateAsync(excessSpeedPay);
        Assert.False(excessSpeedPayRes.IsValid);
        Assert.Contains(excessSpeedPayRes.Errors, e => e.PropertyName == "Amount");

        // 3. Valid invoice checkout
        var invoice = await context.Invoices.FirstAsync(i => i.Balance > 0);
        var validInvoicePay = new SpeedPayFeatures.InitiateInvoiceCheckoutCommand(
            InvoiceNo: invoice.InvoiceNo,
            Amount: invoice.Balance,
            PaymentMethod: "card"
        );
        var invoiceResult = await invoiceVal.ValidateAsync(validInvoicePay);
        Assert.True(invoiceResult.IsValid, string.Join(", ", invoiceResult.Errors.Select(e => e.ErrorMessage)));

        // 4. Excess invoice payment amount
        var excessInvoicePay = validInvoicePay with { Amount = invoice.Balance + 1.00m };
        var excessInvoiceResult = await invoiceVal.ValidateAsync(excessInvoicePay);
        Assert.False(excessInvoiceResult.IsValid);
        Assert.Contains(excessInvoiceResult.Errors, e => e.PropertyName == "Amount");
    }

    [Fact]
    public void AddCashFlowCommandValidator_ShouldValidateCorrectly()
    {
        var validator = new AddCashFlowCommandValidator();

        // 1. Valid inflow
        var validCommand = new CashFlowFeatures.AddCashFlowCommand(
            Type: "Inflow",
            Category: "Collection",
            Amount: 5000m,
            ReferenceNo: "OR-2026-9999",
            Description: "Cash receipt",
            AddedBy: "Test Cashier"
        );
        var result = validator.Validate(validCommand);
        Assert.True(result.IsValid, string.Join(", ", result.Errors.Select(e => e.ErrorMessage)));

        // 2. Invalid negative amount
        var badAmount = validCommand with { Amount = -10m };
        var amountRes = validator.Validate(badAmount);
        Assert.False(amountRes.IsValid);
        Assert.Contains(amountRes.Errors, e => e.PropertyName == "Amount");

        // 3. Invalid cash flow type
        var badType = validCommand with { Type = "Transfer" };
        var typeRes = validator.Validate(badType);
        Assert.False(typeRes.IsValid);
        Assert.Contains(typeRes.Errors, e => e.PropertyName == "Type");
    }

    [Fact]
    public async Task OfficialReceiptValidator_ShouldRejectManualCreation()
    {
        using var context = await GetDbContextAsync();
        var validator = new OfficialReceiptValidator(context);

        var or = new OfficialReceipt
        {
            ReceiptNumber = "OR-MANUAL-123",
            PaymentCollectionId = "PC-001",
            IssuedDate = DateTime.UtcNow
        };

        var result = await validator.ValidateAsync(or);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.ErrorMessage.Contains("only be generated by the system"));
    }

    [Fact]
    public async Task PayrollRecordValidator_ShouldValidateCorrectly()
    {
        using var context = await GetDbContextAsync();
        var validator = new PayrollRecordValidator(context);

        var emp = await context.Employees.FirstAsync();

        // 1. Valid payroll record with deduction lines
        var record = new PayrollRecord
        {
            EmployeeId = emp.Id,
            GrossPay = 25000m,
            NetPay = 22000m,
            Deductions = 3000m,
            PayPeriodStart = DateTime.UtcNow.AddDays(-15),
            PayPeriodEnd = DateTime.UtcNow,
            DeductionLines = new List<PayrollDeductionLine>
            {
                new() { DeductionType = "SSS", Amount = 1500m },
                new() { DeductionType = "PhilHealth", Amount = 1500m }
            }
        };
        var result = await validator.ValidateAsync(record);
        Assert.True(result.IsValid, string.Join(", ", result.Errors.Select(e => e.ErrorMessage)));

        // 2. Invalid employee ID
        var badEmp = new PayrollRecord
        {
            EmployeeId = "EMP-999-NOT-EXISTS",
            GrossPay = 1000m
        };
        var empRes = await validator.ValidateAsync(badEmp);
        Assert.False(empRes.IsValid);
        Assert.Contains(empRes.Errors, e => e.PropertyName == "EmployeeId");

        // 3. Invalid deduction category
        var badDeduction = new PayrollRecord
        {
            EmployeeId = emp.Id,
            GrossPay = 1000m,
            DeductionLines = new List<PayrollDeductionLine>
            {
                new() { DeductionType = "Gym Membership", Amount = 500m }
            }
        };
        var dedRes = await validator.ValidateAsync(badDeduction);
        Assert.False(dedRes.IsValid);
        Assert.Contains(dedRes.Errors, e => e.PropertyName.Contains("DeductionType"));
    }

    [Fact]
    public void VerifyValidationCommandValidator_ShouldValidateCorrectly()
    {
        var validator = new VerifyValidationCommandValidator();

        // 1. Valid approval
        var valid = new ValidationFeatures.VerifyValidationCommand(
            Id: "VAL-001",
            Status: "Approved"
        );
        var result = validator.Validate(valid);
        Assert.True(result.IsValid);

        // 2. Invalid status
        var invalid = new ValidationFeatures.VerifyValidationCommand(
            Id: "VAL-001",
            Status: "Confirmed"
        );
        var invalidRes = validator.Validate(invalid);
        Assert.False(invalidRes.IsValid);
        Assert.Contains(invalidRes.Errors, e => e.PropertyName == "Status");
    }
}
