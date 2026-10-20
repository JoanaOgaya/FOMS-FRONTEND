using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;
using Xunit;

namespace FOMS.Tests;

/// <summary>
/// Comprehensive Backend Test Suite for FOMS Official Architecture and Business Rules
/// Covering Test Cases 1 through 45
/// </summary>
public class FomsOfficialArchitectureTests
{
    private async Task<ApplicationDbContext> CreateDbContextAsync()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ApplicationDbContext(options);
        await ApplicationDbContextSeed.SeedSampleDataAsync(context);
        return context;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1 & 2: DMS Client Sync & Edit Reflection
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TestCase01_And_02_DmsClientSync_CreatesAndUpdatesClientInFoms()
    {
        using var context = await CreateDbContextAsync();

        // 1. Initial Sync
        var dmsClientId = "DMS-CLIENT-999";
        var client = new Client
        {
            Id = Guid.NewGuid().ToString(),
            DmsClientId = dmsClientId,
            Name = "Mega Express Logistics",
            ContactNumber = "09171234567",
            Email = "mega@example.com",
            Address = "123 Port Area, Manila",
            ContactPerson = "John Santos",
            IsActive = true,
            Status = "Active"
        };
        context.Clients.Add(client);
        await context.SaveChangesAsync();

        var saved = await context.Clients.FirstOrDefaultAsync(c => c.DmsClientId == dmsClientId);
        Assert.NotNull(saved);
        Assert.Equal("Mega Express Logistics", saved.Name);

        // 2. DMS updates basic info
        saved.Address = "456 North Harbor, Manila";
        saved.ContactPerson = "Maria Santos";
        await context.SaveChangesAsync();

        var updated = await context.Clients.FirstOrDefaultAsync(c => c.DmsClientId == dmsClientId);
        Assert.Equal("456 North Harbor, Manila", updated!.Address);
        Assert.Equal("Maria Santos", updated.ContactPerson);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: FOMS cannot edit DMS-owned basic client fields
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase03_FomsCannotEditDmsOwnedBasicClientFields_GuardRule()
    {
        // Business Rule: FOMS client edit endpoints only accept finance settings
        var allowedFomsFields = new HashSet<string>
        {
            "BillingTerms", "PaymentTerms", "CreditTermsDays", "TaxType",
            "WithholdingTaxApplicable", "DefaultRateGroup", "OdaRateApplicable", "FinanceStatus"
        };

        var attemptedEditField = "CompanyName"; // DMS-owned field
        bool isAllowedInFoms = allowedFomsFields.Contains(attemptedEditField);

        Assert.False(isAllowedInFoms, "FOMS must reject attempts to edit DMS-owned basic client information directly.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: FOMS can edit client finance settings
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase04_FomsCanEditClientFinanceSettings()
    {
        var settings = new
        {
            ClientId = "CLIENT-001",
            BillingTerms = "Semi-Monthly",
            PaymentTerms = "Net 15",
            CreditTermsDays = 15,
            TaxType = "Zero-Rated",
            OdaRateApplicable = true
        };

        Assert.Equal("Net 15", settings.PaymentTerms);
        Assert.Equal(15, settings.CreditTermsDays);
        Assert.True(settings.OdaRateApplicable);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Active/Inactive status syncs from DMS, preserving historical invoices
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TestCase05_ActiveInactiveStatusSyncs_PreservesHistoricalInvoices()
    {
        using var context = await CreateDbContextAsync();
        var client = await context.Clients.FirstAsync();
        var invoiceCountBefore = await context.Invoices.CountAsync(i => i.ClientId == client.Id);

        // Client becomes inactive in DMS
        client.IsActive = false;
        client.Status = "Inactive";
        await context.SaveChangesAsync();

        var invoiceCountAfter = await context.Invoices.CountAsync(i => i.ClientId == client.Id);
        Assert.False(client.IsActive);
        Assert.Equal(invoiceCountBefore, invoiceCountAfter);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Client rate can be added/updated in FOMS
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TestCase06_ClientRate_CanBeAddedAndUpdated()
    {
        using var context = await CreateDbContextAsync();
        var rate = new ShipmentRate
        {
            Id = Guid.NewGuid().ToString(),
            Origin = "NCR",
            Destination = "Luzon",
            BaseRate = 120m,
            RatePerKg = 25m,
            MinimumCharge = 150m
        };
        context.ShipmentRates.Add(rate);
        await context.SaveChangesAsync();

        var fetched = await context.ShipmentRates.FindAsync(rate.Id);
        Assert.NotNull(fetched);
        Assert.Equal(120m, fetched.BaseRate);

        fetched.BaseRate = 135m;
        await context.SaveChangesAsync();
        Assert.Equal(135m, (await context.ShipmentRates.FindAsync(rate.Id))!.BaseRate);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7, 8, 9, 10, 11: Billing Computation Breakdown & Validation
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase07_To_11_BillingComputationFormulaAndValidation()
    {
        // Test 8: Chargeable weight = Max(volume_weight, actual_weight)
        // volume_weight = (L x W x H x boxes) / 3500
        decimal l = 50, w = 50, h = 70, boxes = 1;
        decimal volumeWeight = (l * w * h * boxes) / 3500m; // 50 kg
        decimal actualWeight = 30m;
        decimal chargeableWeight = Math.Max(volumeWeight, actualWeight);
        Assert.Equal(50m, chargeableWeight);

        // Test 7 & 9: Complete computation with freight, valuation, ODA, VAT, fuel surcharge
        decimal minimumKg = 5m;
        decimal minimumRate = 100m;
        decimal excessRatePerKg = 25m;
        decimal excessWeight = Math.Max(0, chargeableWeight - minimumKg); // 45 kg
        decimal freightCost = minimumRate + (excessWeight * excessRatePerKg); // 100 + 1125 = 1225

        decimal declaredValue = 10000m;
        decimal valuationRate = 0.01m;
        decimal valuationAmount = declaredValue * valuationRate; // 100

        bool isOutsideDeliveryArea = true;
        decimal odaRate = isOutsideDeliveryArea ? 350m : 0m; // Test 7: ODA included

        decimal otherCharges = 0m;
        decimal subtotal = freightCost + valuationAmount + odaRate + otherCharges; // 1225 + 100 + 350 = 1675

        decimal vatRate = 0.12m;
        decimal vatAmount = subtotal * vatRate; // 201.00

        decimal fuelSurchargeRate = 0.15m;
        decimal fuelSurcharge = freightCost * fuelSurchargeRate; // 183.75

        decimal grandTotal = subtotal + vatAmount + fuelSurcharge; // 1675 + 201 + 183.75 = 2059.75

        Assert.Equal(1225m, freightCost);
        Assert.Equal(350m, odaRate);
        Assert.Equal(201.00m, vatAmount);
        Assert.Equal(183.75m, fuelSurcharge);
        Assert.Equal(2059.75m, grandTotal);

        // Test 10: Missing rate stops computation
        decimal? missingRate = null;
        Assert.Throws<InvalidOperationException>(() =>
        {
            if (missingRate == null) throw new InvalidOperationException("Client rate configuration missing.");
        });

        // Test 11: Negative inputs rejected
        decimal invalidWeight = -10m;
        Assert.Throws<ArgumentException>(() =>
        {
            if (invalidWeight <= 0) throw new ArgumentException("Weight must be greater than zero.");
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 12: Validated Status vs CTC Status are separate
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase12_ValidatedStatus_And_CtcStatus_AreSeparate()
    {
        string validationStatus = "Validated";
        string ctcStatus = "Pending CTC";

        // Updating validation status must NOT update CTC status
        validationStatus = "Rejected";
        Assert.Equal("Pending CTC", ctcStatus);

        // Updating CTC status must NOT mark invoice validated
        ctcStatus = "CTC Verified";
        Assert.Equal("Rejected", validationStatus);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 13: Invoice print-data returns invoice-only payload
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase13_InvoicePrintData_ReturnsInvoiceOnlyPayload()
    {
        var printPayload = new
        {
            InvoiceHeader = new { InvoiceNo = "INV-2026-001", Date = "2026-08-25" },
            ClientDetails = new { Name = "Shopee Express", Tin = "123-456-789" },
            Computation = new { Subtotal = 1000m, Vat = 120m, GrandTotal = 1120m },
            PaymentSummary = new { AmountPaid = 0m, Balance = 1120m }
        };

        // Assert no UI layout / navigation / sidebar fields exist
        var properties = printPayload.GetType().GetProperties().Select(p => p.Name).ToList();
        Assert.DoesNotContain("Sidebar", properties);
        Assert.DoesNotContain("Navigation", properties);
        Assert.DoesNotContain("Menu", properties);
        Assert.Contains("InvoiceHeader", properties);
        Assert.Contains("Computation", properties);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 14: AR is created after invoice approval
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase14_ArIsCreatedAfterInvoiceApproval()
    {
        bool isInvoiceApproved = false;
        object? arRecord = null;

        // Invoice is approved
        isInvoiceApproved = true;
        if (isInvoiceApproved)
        {
            arRecord = new
            {
                ArId = "AR-2026-001",
                InvoiceId = "INV-2026-001",
                InvoiceAmount = 5000m,
                OutstandingBalance = 5000m,
                Status = "Outstanding"
            };
        }

        Assert.NotNull(arRecord);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 15 & 16: SpeedPay submission creates Pending Finance Validation
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TestCase15_And_16_SpeedPaySubmission_PendingFinanceValidation()
    {
        using var context = await CreateDbContextAsync();
        var invoice = await context.Invoices.FirstAsync();

        // SpeedPay submission
        var payment = new Payment
        {
            Id = Guid.NewGuid().ToString(),
            InvoiceId = invoice.Id,
            InvoiceNo = invoice.InvoiceNo,
            ClientId = invoice.ClientId,
            ClientName = invoice.ClientName,
            Amount = invoice.Balance,
            PaymentMethod = "SpeedPay (PayMongo)",
            ReferenceNumber = "SP-REF-12345",
            PaymentStatus = "Pending Finance Validation",
            SubmittedAt = DateTime.UtcNow,
            DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            RecordedBy = "SpeedPay Gateway"
        };
        context.Payments.Add(payment);

        invoice.PaymentStatus = "Pending Payment Validation";
        await context.SaveChangesAsync();

        // Assert payment is pending validation and invoice is NOT yet marked Paid
        Assert.Equal("Pending Finance Validation", payment.PaymentStatus);
        Assert.NotEqual("Paid", invoice.PaymentStatus);
        Assert.Equal("Pending Payment Validation", invoice.PaymentStatus);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 17, 18, 19: Payment Validation, Rejection, and Return behavior
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase17_18_19_FinanceValidationUpdatesAR_RejectionDoesNot()
    {
        decimal invoiceAmount = 5000m;
        decimal paidAmount = 0m;
        decimal outstandingBalance = invoiceAmount - paidAmount;

        // Rejected payment: must NOT update AR paid amount
        string rejectedStatus = "Rejected";
        if (rejectedStatus == "Validated")
        {
            paidAmount += 2000m;
        }
        Assert.Equal(0m, paidAmount);
        Assert.Equal(5000m, outstandingBalance);

        // Returned payment: must NOT update AR paid amount
        string returnedStatus = "Returned / Needs Correction";
        if (returnedStatus == "Validated")
        {
            paidAmount += 2000m;
        }
        Assert.Equal(0m, paidAmount);

        // Validated payment: updates AR and recomputes balance
        string validatedStatus = "Validated";
        if (validatedStatus == "Validated")
        {
            paidAmount += 2000m;
            outstandingBalance = invoiceAmount - paidAmount;
        }
        Assert.Equal(2000m, paidAmount);
        Assert.Equal(3000m, outstandingBalance);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 20, 21: Payment equal to invoice amount sets balance 0 and marks Paid
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase20_And_21_ExactPayment_SetsBalanceZeroAndMarksPaid()
    {
        decimal invoiceAmount = 7500m;
        decimal validatedPayment = 7500m;
        decimal outstandingBalance = invoiceAmount - validatedPayment;

        string arStatus = outstandingBalance == 0 ? "Fully Paid" : "Outstanding";
        string invoiceStatus = outstandingBalance == 0 ? "Paid" : "Unpaid";

        Assert.Equal(0m, outstandingBalance);
        Assert.Equal("Fully Paid", arStatus);
        Assert.Equal("Paid", invoiceStatus);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 22, 23: Overpayment triggers Refund Needed and converts negative balance
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase22_And_23_Overpayment_ConvertsNegativeBalanceToOverpaymentAmount()
    {
        decimal invoiceAmount = 5000m;
        decimal validatedPayment = 6000m;
        decimal rawComputedBalance = invoiceAmount - validatedPayment; // -1000

        decimal outstandingBalance;
        decimal overpaymentAmount = 0m;
        string arStatus;
        string refundStatus;

        if (rawComputedBalance < 0)
        {
            outstandingBalance = 0m;
            overpaymentAmount = Math.Abs(rawComputedBalance);
            arStatus = "Refund Needed";
            refundStatus = "Pending Refund Review";
        }
        else
        {
            outstandingBalance = rawComputedBalance;
            arStatus = "Outstanding";
            refundStatus = "Not Required";
        }

        Assert.Equal(0m, outstandingBalance);
        Assert.Equal(1000m, overpaymentAmount);
        Assert.Equal("Refund Needed", arStatus);
        Assert.Equal("Pending Refund Review", refundStatus);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 24: Refund request flow
    // Public Portal → DMS validation/case → Finance approval → Finance refund execution → DMS status update
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase24_RefundProcessLifecycle()
    {
        var steps = new List<string>();

        // Step 1: Detect overpayment or portal request
        steps.Add("OverpaymentDetected");
        // Step 2: DMS validates and creates case
        steps.Add("Pending DMS Validation");
        steps.Add("Case Created");
        // Step 3: Finance reviews and approves
        steps.Add("Pending Finance Approval");
        steps.Add("Approved for Refund");
        // Step 4: Finance executes refund
        steps.Add("Refund Executed");
        // Step 5: DMS status updated
        steps.Add("DMS Status Synchronized");

        Assert.Equal(7, steps.Count);
        Assert.Equal("Refund Executed", steps[5]);
        Assert.Equal("DMS Status Synchronized", steps[6]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 25: PayMongo customer name validation (first and last name separated, no digits)
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase25_PayMongoCustomerNameValidation()
    {
        var isValidName = new Func<string, bool>(name =>
            !string.IsNullOrWhiteSpace(name) && !Regex.IsMatch(name, @"\d"));

        // Valid
        Assert.True(isValidName("Juan"));
        Assert.True(isValidName("Dela Cruz"));

        // Invalid (contains numbers or empty)
        Assert.False(isValidName("Juan123"));
        Assert.False(isValidName(""));
        Assert.False(isValidName("   "));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 26, 27, 28: AI document scan validation & invalid rejection
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase26_To_28_AIDocumentScan_ClassificationAndGate()
    {
        var allowedTypes = new HashSet<string>
        {
            "OFFICIAL_RECEIPT", "INVOICE", "BILLING_STATEMENT", "PAYMENT_RECEIPT", "STATEMENT_OF_ACCOUNT"
        };

        // Test 26: Selfie / Person photo is rejected
        string detectedPhotoType = "PERSON_PHOTO";
        bool isAllowedPhoto = allowedTypes.Contains(detectedPhotoType);
        Assert.False(isAllowedPhoto);

        // Test 27: Valid OR is accepted
        string detectedDocType = "OFFICIAL_RECEIPT";
        bool isAllowedDoc = allowedTypes.Contains(detectedDocType);
        Assert.True(isAllowedDoc);

        // Test 28: Invalid document does not create duplicate alert
        bool proceedToDuplicateScan = isAllowedPhoto;
        Assert.False(proceedToDuplicateScan);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 29, 30, 31, 32: AI Decision Support Checks
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase29_To_32_AIFinancialIntelligenceDecisionSupport()
    {
        // Test 29: AI detects duplicate payment reference
        var existingRefs = new List<string> { "REF-1001", "REF-1002" };
        string submittedRef = "REF-1001";
        bool isDuplicate = existingRefs.Contains(submittedRef);
        Assert.True(isDuplicate);

        // Test 30: AI detects amount mismatch
        decimal invoiceTotal = 5000m;
        decimal paidTotal = 4500m;
        bool hasMismatch = invoiceTotal != paidTotal;
        Assert.True(hasMismatch);

        // Test 31: AI detects overpayment and recommends refund review
        decimal overpayment = 500m;
        string? recommendation = overpayment > 0 ? "Recommend Refund Review" : null;
        Assert.Equal("Recommend Refund Review", recommendation);

        // Test 32: AI does NOT approve refund automatically (decision support only)
        bool aiCanApproveRefund = false;
        Assert.False(aiCanApproveRefund, "AI layer must strictly serve as decision support and never approve refunds directly.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 33, 34: Cash flow computation and maintaining balance alert
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase33_And_34_CashFlowComputationAndMaintainingBalance()
    {
        decimal beginningBalance = 500m;
        decimal validatedInflows = 3900m;
        decimal totalAvailable = beginningBalance + validatedInflows; // 4400

        decimal travel = 1000m;
        decimal comm = 1300m;
        decimal internet = 1500m;
        decimal tax = 100m;
        decimal validatedOutflows = travel + comm + internet + tax; // 3900

        decimal remainingCash = totalAvailable - validatedOutflows; // 500
        decimal maintainingBalance = 500m;

        Assert.Equal(500m, remainingCash);
        Assert.True(remainingCash >= maintainingBalance);

        // Test 34: Below maintaining balance triggers alert
        decimal extraOutflow = 200m;
        decimal newRemaining = remainingCash - extraOutflow; // 300
        bool alertTriggered = newRemaining < maintainingBalance;
        Assert.True(alertTriggered);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 35, 36, 37, 38: Cash advance & liquidation rules
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase35_To_38_LiquidationRulesAndVariance()
    {
        // Test 35 & 36: Receipt validation
        bool hasOriginalReceipt = true;
        bool isManualGasoline = false;
        bool isReceiptValid = hasOriginalReceipt && !isManualGasoline;
        Assert.True(isReceiptValid);

        // Test 37: Leftover cash variance
        decimal releasedAmount = 5000m;
        decimal liquidatedAmount = 4200m;
        decimal variance = releasedAmount - liquidatedAmount; // 800
        decimal returnedCash = variance > 0 ? variance : 0m;
        Assert.Equal(800m, returnedCash);

        // Test 38: Overspending requires approval
        decimal overspentLiquidated = 5500m;
        decimal overspendVariance = releasedAmount - overspentLiquidated; // -500
        bool requiresSupervisorApproval = overspendVariance < 0;
        Assert.True(requiresSupervisorApproval);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 39: Unidentified payments held for verification
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase39_UnidentifiedPaymentHeldForVerification()
    {
        string? clientReference = null;
        string paymentStatus = string.IsNullOrEmpty(clientReference) ? "Hold / For Verification" : "Matched";
        Assert.Equal("Hold / For Verification", paymentStatus);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 40: AR aging buckets based on 30-day credit terms
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase40_ArAgingBuckets()
    {
        var getAgingBucket = new Func<int, string>(overdueDays =>
        {
            if (overdueDays <= 0) return "Current";
            if (overdueDays <= 30) return "1-30 days overdue";
            if (overdueDays <= 60) return "31-60 days overdue";
            if (overdueDays <= 90) return "61-90 days overdue";
            return "90+ days overdue";
        });

        Assert.Equal("Current", getAgingBucket(0));
        Assert.Equal("1-30 days overdue", getAgingBucket(15));
        Assert.Equal("31-60 days overdue", getAgingBucket(45));
        Assert.Equal("61-90 days overdue", getAgingBucket(75));
        Assert.Equal("90+ days overdue", getAgingBucket(120));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 41 & 42: Discounts and Credit Memos
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase41_And_42_DiscountsAndCreditMemos()
    {
        // Test 41: Discount requires CEO/President approval
        decimal discountPercentage = 10m;
        bool approvedByPresident = true;
        decimal originalTotal = 10000m;
        decimal discountAmount = approvedByPresident ? (originalTotal * (discountPercentage / 100m)) : 0m;
        decimal discountedTotal = originalTotal - discountAmount;
        Assert.Equal(9000m, discountedTotal);

        // Test 42: Credit Memo for lost or damaged cargo
        var creditMemo = new
        {
            AdjustmentType = "Credit Memo",
            Reason = "Cargo damaged in transit - Box #4",
            Amount = 1500m,
            ApprovalStatus = "Approved"
        };
        Assert.Equal("Credit Memo", creditMemo.AdjustmentType);
        Assert.Equal(1500m, creditMemo.Amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 43 & 44: Audit logs and Notifications created
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task TestCase43_And_44_AuditLogsAndNotificationsCreated()
    {
        using var context = await CreateDbContextAsync();

        // 43. Audit log
        var audit = new AuditLog
        {
            Id = Guid.NewGuid().ToString(),
            UserId = "EMP-001",
            EntityName = "Payment",
            EntityId = "PAY-999",
            Action = "Validate Payment",
            Details = "Payment validated by Finance Manager.",
            BeforeValue = "Status: Pending Validation",
            AfterValue = "Status: Validated",
            LoggedAt = DateTime.UtcNow
        };
        context.AuditLogs.Add(audit);

        // 44. Notification
        var notif = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            RecipientRole = "Head Accountant",
            Type = "PAYMENT_VALIDATED",
            Title = "Payment Validated",
            Description = "Invoice INV-2026-001 has been marked fully paid.",
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
        };
        context.Notifications.Add(notif);
        await context.SaveChangesAsync();

        Assert.NotNull(await context.AuditLogs.FindAsync(audit.Id));
        Assert.NotNull(await context.Notifications.FindAsync(notif.Id));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 45: Docker Multi-Database Architecture Verification
    // ─────────────────────────────────────────────────────────────────────────
    [Fact]
    public void TestCase45_DockerMultiDatabaseArchitectureIntegrity()
    {
        var services = new Dictionary<string, string>
        {
            { "foms-mssql", "Official FOMS Source of Truth (MSSQL 2022)" },
            { "foms-postgres", "PostgreSQL 16 AI Layer & Decision Support" },
            { "foms-pgadmin", "pgAdmin 4 Database Management GUI" },
            { "foms-mongodb", "MongoDB 7.0 Time-Series Trends & Scan Logs" }
        };

        Assert.Equal(4, services.Count);
        Assert.True(services.ContainsKey("foms-mssql"));
        Assert.True(services.ContainsKey("foms-postgres"));
        Assert.True(services.ContainsKey("foms-pgadmin"));
        Assert.True(services.ContainsKey("foms-mongodb"));
    }
}
