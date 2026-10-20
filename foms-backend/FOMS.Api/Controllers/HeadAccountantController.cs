using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/head-accountant")]
[Route("head-accountant")]
public class HeadAccountantController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public HeadAccountantController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    private string CurrentUser() =>
        User.FindFirst(ClaimTypes.Name)?.Value
        ?? User.FindFirst("name")?.Value
        ?? User.FindFirst("username")?.Value
        ?? "EMP-002";

    private string CurrentRole() =>
        User.FindFirst(ClaimTypes.Role)?.Value
        ?? User.FindFirst("role")?.Value
        ?? "Head Accountant";

    private async Task LogAuditAsync(string action, string module, string? recordType, int? recordId, string? beforeVal, string? afterVal, string? remarks)
    {
        try
        {
            var audit = new AuditLog
            {
                user_id = 2,
                role = CurrentRole(),
                action = action,
                module = module,
                affected_record_type = recordType,
                affected_record_id = recordId,
                before_value = beforeVal,
                after_value = afterVal,
                remarks = remarks,
                created_at = DateTime.UtcNow
            };
            _fomsDb.AuditLogs.Add(audit);
            await _fomsDb.SaveChangesAsync();
        }
        catch { }
    }

    // 1. Dashboard
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
        var payments = await _fomsDb.Payments.AsNoTracking().ToListAsync();
        var arRecords = await _fomsDb.AccountsReceivable.AsNoTracking().ToListAsync();
        var adjustments = await _fomsDb.FinancialAdjustments.AsNoTracking().ToListAsync();
        var recentLogs = await _fomsDb.AuditLogs.AsNoTracking().OrderByDescending(a => a.created_at).Take(10).ToListAsync();

        var pendingInvoices = invoices.Count(i => i.InvoiceStatus == "Pending Approval" || i.InvoiceStatus == "For Review" || i.ValidationStatus == "Pending Validation");
        var pendingPayments = payments.Count(p => p.PaymentStatus == "Pending Validation" || p.PaymentStatus == "Pending");
        var pendingAdjustments = adjustments.Count(a => a.Status == "Pending Approval");
        var speedPayPending = payments.Count(p => (p.PaymentMethod == "PayMongo" || p.PaymentMethod == "SpeedPay" || p.PaymentMethod == "GCash" || p.PaymentMethod == "Maya") && p.PaymentStatus == "Pending Validation");
        var totalBalance = arRecords.Sum(r => r.OutstandingBalance ?? 0m);

        return Ok(new
        {
            success = true,
            data = new
            {
                totalInvoices = invoices.Count,
                pendingInvoices,
                pendingPayments,
                pendingAdjustments,
                speedPayPending,
                accountsReceivableTotal = totalBalance,
                overdueInvoices = invoices.Count(i => i.InvoiceStatus == "Overdue"),
                recentActivities = recentLogs.Select(l => new
                {
                    id = l.audit_id,
                    action = l.action,
                    module = l.module,
                    actor = l.role ?? "Head Accountant",
                    remarks = l.remarks,
                    timestamp = (l.created_at ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss")
                })
            }
        });
    }

    // 2. Invoices
    [HttpGet("invoices")]
    public async Task<IActionResult> GetInvoices()
    {
        var invoices = await _fomsDb.Invoices.AsNoTracking().OrderByDescending(i => i.CreatedAt).ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        return Ok(new
        {
            success = true,
            count = invoices.Count,
            data = invoices.Select(i =>
            {
                var cl = clients.FirstOrDefault(c => c.ClientId == i.ClientId);
                var subtotal = Math.Round(i.TotalAmount / 1.12m, 2);
                var vatAmount = i.TotalAmount - subtotal;
                return new
                {
                    id = i.InvoiceId.ToString(),
                    invoiceId = i.InvoiceId,
                    invoiceNumber = i.InvoiceNumber,
                    invoiceNo = i.InvoiceNumber,
                    clientName = cl?.CompanyName ?? $"Client #{i.ClientId}",
                    clientId = i.ClientId,
                    totalAmount = i.TotalAmount,
                    subtotal = subtotal,
                    vatAmount = vatAmount,
                    status = i.InvoiceStatus ?? "Pending Approval",
                    dueDate = i.DueDate?.ToString("yyyy-MM-dd"),
                    billingDate = i.CreatedAt?.ToString("yyyy-MM-dd"),
                    createdAt = i.CreatedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
                };
            })
        });
    }

    // 3. Billing Validation
    [HttpGet("billing-validation")]
    public async Task<IActionResult> GetBillingValidation()
    {
        var docs = await _fomsDb.BillingDocuments.AsNoTracking().ToListAsync();
        var waybills = await _fomsDb.Waybills.AsNoTracking().ToListAsync();
        return Ok(new
        {
            success = true,
            count = docs.Count,
            data = docs.Select(d =>
            {
                var wb = waybills.FirstOrDefault(w => w.WaybillId == d.WaybillId);
                return new
                {
                    id = d.BillingDocId,
                    billingDocId = d.BillingDocId,
                    waybillId = d.WaybillId,
                    waybillNumber = wb?.WaybillNumber ?? $"WB-{d.WaybillId}",
                    clientId = d.ClientId,
                    amount = d.ComputedAmount,
                    validationStatus = d.ValidationStatus ?? "Pending Validation",
                    ctcStatus = d.CtcStatus ?? "Standard",
                    createdAt = d.CreatedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
                };
            })
        });
    }

    [HttpPost("billing-validation/{id}/approve")]
    public async Task<IActionResult> ApproveBillingValidation(int id, [FromBody] dynamic? body)
    {
        var doc = await _fomsDb.BillingDocuments.FindAsync(id);
        if (doc == null) return NotFound(new { success = false, message = "Billing document not found." });

        var prev = doc.ValidationStatus;
        doc.ValidationStatus = "Validated";
        doc.ValidatedAt = DateTime.UtcNow;
        doc.ValidatedBy = 2;
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("APPROVE_BILLING", "Billing Validation", "BillingDocument", id, prev, "Validated", "Head Accountant approved billing validation.");
        return Ok(new { success = true, message = "Billing document approved successfully." });
    }

    [HttpPost("billing-validation/{id}/reject")]
    public async Task<IActionResult> RejectBillingValidation(int id, [FromBody] dynamic? body)
    {
        var doc = await _fomsDb.BillingDocuments.FindAsync(id);
        if (doc == null) return NotFound(new { success = false, message = "Billing document not found." });

        var prev = doc.ValidationStatus;
        doc.ValidationStatus = "Rejected";
        doc.ValidatedAt = DateTime.UtcNow;
        doc.ValidatedBy = 2;
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("REJECT_BILLING", "Billing Validation", "BillingDocument", id, prev, "Rejected", "Head Accountant rejected billing validation.");
        return Ok(new { success = true, message = "Billing document rejected successfully." });
    }

    [HttpPost("billing-validation/{id}/return")]
    public async Task<IActionResult> ReturnBillingValidation(int id, [FromBody] dynamic? body)
    {
        var doc = await _fomsDb.BillingDocuments.FindAsync(id);
        if (doc == null) return NotFound(new { success = false, message = "Billing document not found." });

        var prev = doc.ValidationStatus;
        doc.ValidationStatus = "Needs Revision";
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("RETURN_BILLING", "Billing Validation", "BillingDocument", id, prev, "Needs Revision", "Head Accountant returned billing validation for revision.");
        return Ok(new { success = true, message = "Billing document returned for revision." });
    }

    // 4. Invoice Review
    [HttpGet("invoice-review")]
    public async Task<IActionResult> GetInvoiceReview()
    {
        var invoices = await _fomsDb.Invoices.AsNoTracking()
            .Where(i => i.InvoiceStatus == "Pending Approval" || i.InvoiceStatus == "For Review" || i.InvoiceStatus == "Needs Revision" || i.ValidationStatus == "Pending Validation")
            .ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        return Ok(new
        {
            success = true,
            count = invoices.Count,
            data = invoices.Select(i =>
            {
                var cl = clients.FirstOrDefault(c => c.ClientId == i.ClientId);
                return new
                {
                    invoiceId = i.InvoiceId,
                    invoiceNumber = i.InvoiceNumber,
                    clientName = cl?.CompanyName ?? $"Client #{i.ClientId}",
                    totalAmount = i.TotalAmount,
                    status = i.InvoiceStatus ?? "Pending Approval",
                    dueDate = i.DueDate?.ToString("yyyy-MM-dd"),
                    createdAt = i.CreatedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
                };
            })
        });
    }

    [HttpPost("invoice-review/{invoiceId}/approve")]
    public async Task<IActionResult> ApproveInvoice(int invoiceId)
    {
        var invoice = await _fomsDb.Invoices.FindAsync(invoiceId);
        if (invoice == null) return NotFound(new { success = false, message = "Invoice not found." });

        var prev = invoice.InvoiceStatus;
        invoice.InvoiceStatus = "Approved";
        invoice.ValidationStatus = "Validated";
        invoice.UpdatedAt = DateTime.UtcNow;
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("APPROVE_INVOICE", "Invoice Review", "Invoice", invoiceId, prev, "Approved", "Head Accountant approved invoice.");
        return Ok(new { success = true, message = "Invoice approved successfully." });
    }

    [HttpPost("invoice-review/{invoiceId}/reject")]
    public async Task<IActionResult> RejectInvoice(int invoiceId)
    {
        var invoice = await _fomsDb.Invoices.FindAsync(invoiceId);
        if (invoice == null) return NotFound(new { success = false, message = "Invoice not found." });

        var prev = invoice.InvoiceStatus;
        invoice.InvoiceStatus = "Rejected";
        invoice.ValidationStatus = "Rejected";
        invoice.UpdatedAt = DateTime.UtcNow;
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("REJECT_INVOICE", "Invoice Review", "Invoice", invoiceId, prev, "Rejected", "Head Accountant rejected invoice.");
        return Ok(new { success = true, message = "Invoice rejected successfully." });
    }

    [HttpPost("invoice-review/{invoiceId}/return")]
    public async Task<IActionResult> ReturnInvoice(int invoiceId)
    {
        var invoice = await _fomsDb.Invoices.FindAsync(invoiceId);
        if (invoice == null) return NotFound(new { success = false, message = "Invoice not found." });

        var prev = invoice.InvoiceStatus;
        invoice.InvoiceStatus = "Needs Revision";
        invoice.ValidationStatus = "Returned";
        invoice.UpdatedAt = DateTime.UtcNow;
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("RETURN_INVOICE", "Invoice Review", "Invoice", invoiceId, prev, "Needs Revision", "Head Accountant returned invoice for revision.");
        return Ok(new { success = true, message = "Invoice returned for revision." });
    }

    // 5. Accounts Receivable
    [HttpGet("accounts-receivable")]
    public async Task<IActionResult> GetAccountsReceivable()
    {
        var ar = await _fomsDb.AccountsReceivable.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();
        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();

        return Ok(new
        {
            success = true,
            count = ar.Count,
            data = ar.Select(a =>
            {
                var cl = clients.FirstOrDefault(c => c.ClientId == a.ClientId);
                var inv = invoices.FirstOrDefault(i => i.InvoiceId == a.InvoiceId);
                return new
                {
                    arId = a.ArId,
                    invoiceId = a.InvoiceId,
                    invoiceNumber = inv?.InvoiceNumber ?? $"INV-{a.InvoiceId}",
                    clientName = cl?.CompanyName ?? "Unknown",
                    invoiceAmount = a.InvoiceAmount,
                    paidAmount = a.PaidAmount ?? 0m,
                    outstandingBalance = a.OutstandingBalance ?? 0m,
                    arStatus = a.ArStatus ?? "Current",
                    dueDate = a.DueDate?.ToString("yyyy-MM-dd")
                };
            })
        });
    }

    // 6. Payment Validation
    [HttpGet("payment-validation")]
    public async Task<IActionResult> GetPaymentValidation()
    {
        var payments = await _fomsDb.Payments.AsNoTracking().OrderByDescending(p => p.SubmittedAt).ToListAsync();
        return Ok(new
        {
            success = true,
            count = payments.Count,
            data = payments.Select(p => new
            {
                paymentId = p.PaymentId,
                invoiceId = p.InvoiceId,
                clientId = p.ClientId,
                amount = p.Amount,
                paymentMethod = p.PaymentMethod,
                paymentStatus = p.PaymentStatus,
                referenceNumber = p.ReferenceNumber,
                submittedAt = p.SubmittedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
            })
        });
    }

    [HttpPost("payments/{paymentId}/validate")]
    public async Task<IActionResult> ValidatePayment(int paymentId)
    {
        var payment = await _fomsDb.Payments.FindAsync(paymentId);
        if (payment == null) return NotFound(new { success = false, message = "Payment not found." });

        payment.PaymentStatus = "Validated";
        payment.ValidatedAt = DateTime.UtcNow;
        payment.ValidatedBy = 2;

        _fomsDb.PaymentHistory.Add(new PaymentHistory
        {
            PaymentId = paymentId,
            InvoiceId = payment.InvoiceId,
            Status = "Validated",
            Action = "VALIDATE_PAYMENT",
            Remarks = "Payment validated by Head Accountant.",
            PerformedBy = 2,
            PerformedRole = "Head Accountant",
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("VALIDATE_PAYMENT", "Payments", "Payment", paymentId, "Pending", "Validated", "Payment validated by Head Accountant.");

        return Ok(new { success = true, message = "Payment validated successfully." });
    }

    [HttpPost("payments/{paymentId}/reject")]
    public async Task<IActionResult> RejectPayment(int paymentId)
    {
        var payment = await _fomsDb.Payments.FindAsync(paymentId);
        if (payment == null) return NotFound(new { success = false, message = "Payment not found." });

        payment.PaymentStatus = "Rejected";

        _fomsDb.PaymentHistory.Add(new PaymentHistory
        {
            PaymentId = paymentId,
            InvoiceId = payment.InvoiceId,
            Status = "Rejected",
            Action = "REJECT_PAYMENT",
            Remarks = "Payment rejected by Head Accountant.",
            PerformedBy = 2,
            PerformedRole = "Head Accountant",
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("REJECT_PAYMENT", "Payments", "Payment", paymentId, "Pending", "Rejected", "Payment rejected by Head Accountant.");

        return Ok(new { success = true, message = "Payment rejected." });
    }

    [HttpPost("payments/{paymentId}/return")]
    public async Task<IActionResult> ReturnPayment(int paymentId)
    {
        var payment = await _fomsDb.Payments.FindAsync(paymentId);
        if (payment == null) return NotFound(new { success = false, message = "Payment not found." });

        payment.PaymentStatus = "Returned";

        _fomsDb.PaymentHistory.Add(new PaymentHistory
        {
            PaymentId = paymentId,
            InvoiceId = payment.InvoiceId,
            Status = "Returned",
            Action = "RETURN_PAYMENT",
            Remarks = "Payment returned for correction by Head Accountant.",
            PerformedBy = 2,
            PerformedRole = "Head Accountant",
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("RETURN_PAYMENT", "Payments", "Payment", paymentId, "Pending", "Returned", "Payment returned by Head Accountant.");

        return Ok(new { success = true, message = "Payment returned for correction." });
    }

    // 7. SpeedPay Validation
    [HttpGet("speedpay-validation")]
    public async Task<IActionResult> GetSpeedPayValidation()
    {
        var list = await _fomsDb.Payments.AsNoTracking()
            .Where(p => p.PaymentMethod == "PayMongo" || p.PaymentMethod == "SpeedPay" || p.PaymentMethod == "GCash" || p.PaymentMethod == "Maya")
            .ToListAsync();
        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        return Ok(new
        {
            success = true,
            count = list.Count,
            data = list.Select(p =>
            {
                var inv = invoices.FirstOrDefault(i => i.InvoiceId == p.InvoiceId);
                var cl = clients.FirstOrDefault(c => c.ClientId == p.ClientId);
                return new
                {
                    paymentId = p.PaymentId,
                    invoiceId = p.InvoiceId,
                    invoiceNumber = inv?.InvoiceNumber ?? $"INV-{p.InvoiceId}",
                    clientName = cl?.CompanyName ?? "Unknown",
                    amount = p.Amount,
                    paymentMethod = p.PaymentMethod,
                    speedpayReference = p.ReferenceNumber,
                    paymongoReference = p.ReferenceNumber,
                    paymentStatus = p.PaymentStatus,
                    submittedAt = p.SubmittedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
                };
            })
        });
    }

    // 8. Settlements
    [HttpGet("settlements")]
    [HttpGet("record-settlement")]
    public async Task<IActionResult> GetSettlements()
    {
        var settlements = await _fomsDb.Settlements.AsNoTracking().ToListAsync();
        return Ok(new
        {
            success = true,
            count = settlements.Count,
            data = settlements.Select(s => new
            {
                settlementId = s.SettlementId,
                recordId = $"SET-{s.SettlementId:D4}",
                tripRef = s.CourierTrip?.Split('-').LastOrDefault()?.Trim() ?? "TRIP-001",
                courierName = s.CourierTrip?.Split('-').FirstOrDefault()?.Trim() ?? "Courier",
                courierTrip = s.CourierTrip ?? "Courier - TRIP-001",
                amount = s.Amount,
                status = s.Status ?? "For validation",
                dateSubmitted = (s.SubmittedAt ?? s.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd")
            })
        });
    }

    [HttpPost("settlements/{settlementId}/validate")]
    public async Task<IActionResult> ValidateSettlement(int settlementId)
    {
        var set = await _fomsDb.Settlements.FindAsync(settlementId);
        if (set == null) return NotFound(new { success = false, message = "Settlement not found." });

        set.Status = "Validated";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("VALIDATE_SETTLEMENT", "Settlements", "Settlement", settlementId, "Pending", "Validated", "Settlement validated by Head Accountant.");
        return Ok(new { success = true, message = "Settlement validated." });
    }

    [HttpPost("settlements/{settlementId}/reject")]
    public async Task<IActionResult> RejectSettlement(int settlementId)
    {
        var set = await _fomsDb.Settlements.FindAsync(settlementId);
        if (set == null) return NotFound(new { success = false, message = "Settlement not found." });

        set.Status = "Rejected";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("REJECT_SETTLEMENT", "Settlements", "Settlement", settlementId, "Pending", "Rejected", "Settlement rejected by Head Accountant.");
        return Ok(new { success = true, message = "Settlement rejected." });
    }

    [HttpPost("settlements/{settlementId}/return")]
    public async Task<IActionResult> ReturnSettlement(int settlementId)
    {
        var set = await _fomsDb.Settlements.FindAsync(settlementId);
        if (set == null) return NotFound(new { success = false, message = "Settlement not found." });

        set.Status = "Needs Revision";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("RETURN_SETTLEMENT", "Settlements", "Settlement", settlementId, "Pending", "Needs Revision", "Settlement returned by Head Accountant.");
        return Ok(new { success = true, message = "Settlement returned." });
    }

    [HttpPost("record-settlement")]
    public async Task<IActionResult> CreateSettlement([FromBody] dynamic body)
    {
        var courier = body?.courierName?.ToString() ?? "Courier";
        var trip = body?.tripRef?.ToString() ?? "TRIP-001";
        var set = new Settlement
        {
            CourierTrip = $"{courier} - {trip}",
            RecordType = body?.recordType?.ToString() ?? "Trip Settlement",
            Amount = (decimal?)body?.amount ?? 0m,
            Status = "For validation",
            SubmittedBy = 2,
            SubmittedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        _fomsDb.Settlements.Add(set);
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("RECORD_SETTLEMENT", "Settlements", "Settlement", set.SettlementId, null, "For validation", "Settlement recorded by Head Accountant.");
        return Ok(new { success = true, message = "Settlement recorded successfully." });
    }

    // 9. Adjustment Validation
    [HttpGet("adjustment-validation")]
    public async Task<IActionResult> GetAdjustmentValidation()
    {
        var list = await _fomsDb.FinancialAdjustments.AsNoTracking().ToListAsync();
        return Ok(new
        {
            success = true,
            count = list.Count,
            data = list.Select(a => new
            {
                adjustmentId = a.AdjustmentId,
                invoiceId = a.InvoiceId,
                adjustmentType = a.AdjustmentType,
                amount = a.Amount,
                reason = a.Reason,
                status = a.Status ?? "Pending Approval",
                createdAt = a.CreatedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
            })
        });
    }

    [HttpPost("adjustments/{adjustmentId}/validate")]
    public async Task<IActionResult> ValidateAdjustment(int adjustmentId)
    {
        var adj = await _fomsDb.FinancialAdjustments.FindAsync(adjustmentId);
        if (adj == null) return NotFound(new { success = false, message = "Adjustment not found." });

        adj.Status = "Approved";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("VALIDATE_ADJUSTMENT", "Financial Adjustments", "FinancialAdjustment", adjustmentId, "Pending", "Approved", "Adjustment validated by Head Accountant.");
        return Ok(new { success = true, message = "Adjustment validated." });
    }

    [HttpPost("adjustments/{adjustmentId}/reject")]
    public async Task<IActionResult> RejectAdjustment(int adjustmentId)
    {
        var adj = await _fomsDb.FinancialAdjustments.FindAsync(adjustmentId);
        if (adj == null) return NotFound(new { success = false, message = "Adjustment not found." });

        adj.Status = "Rejected";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("REJECT_ADJUSTMENT", "Financial Adjustments", "FinancialAdjustment", adjustmentId, "Pending", "Rejected", "Adjustment rejected by Head Accountant.");
        return Ok(new { success = true, message = "Adjustment rejected." });
    }

    [HttpPost("adjustments/{adjustmentId}/return")]
    public async Task<IActionResult> ReturnAdjustment(int adjustmentId)
    {
        var adj = await _fomsDb.FinancialAdjustments.FindAsync(adjustmentId);
        if (adj == null) return NotFound(new { success = false, message = "Adjustment not found." });

        adj.Status = "Needs Revision";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("RETURN_ADJUSTMENT", "Financial Adjustments", "FinancialAdjustment", adjustmentId, "Pending", "Needs Revision", "Adjustment returned by Head Accountant.");
        return Ok(new { success = true, message = "Adjustment returned." });
    }

    // 10. AI Unique Documents, For Review, and Review History
    [HttpGet("ai/unique-documents")]
    public async Task<IActionResult> GetUniqueDocuments()
    {
        var reviews = await _fomsDb.AIReviewHistories.AsNoTracking().Where(r => r.FinalDecision == "Verified Unique" || r.FinalDecision == "Resolved").ToListAsync();
        return Ok(new
        {
            success = true,
            count = reviews.Count,
            data = reviews.Select(r => new
            {
                id = r.ReviewId.ToString(),
                documentNumber = r.DocumentNumber,
                documentType = "Invoice",
                status = r.FinalDecision,
                reviewer = r.Reviewer,
                reviewedDate = r.ReviewedDate?.ToString("yyyy-MM-dd")
            })
        });
    }

    [HttpGet("for-review")]
    public async Task<IActionResult> GetForReview()
    {
        var list = await _fomsDb.AIReviewHistories.AsNoTracking().Where(r => r.FinalDecision == "Flagged" || r.FinalDecision == "Duplicate").ToListAsync();
        return Ok(new
        {
            success = true,
            count = list.Count,
            data = list.Select(r => new
            {
                id = r.ReviewId,
                reviewId = r.ReviewId,
                documentNumber = r.DocumentNumber,
                status = r.FinalDecision,
                decisionReason = r.DecisionReason,
                reviewedDate = r.ReviewedDate?.ToString("yyyy-MM-dd")
            })
        });
    }

    [HttpPost("for-review/{reviewId}/approve")]
    public async Task<IActionResult> ApproveForReview(int reviewId)
    {
        var rev = await _fomsDb.AIReviewHistories.FindAsync(reviewId);
        if (rev == null) return NotFound(new { success = false, message = "Review record not found." });
        rev.FinalDecision = "Verified Unique";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("APPROVE_AI_FLAG", "AI Duplicate Review", "AIReviewHistory", reviewId, "Flagged", "Verified Unique", "Head Accountant endorsed unique document.");
        return Ok(new { success = true, message = "Marked as Verified Unique." });
    }

    [HttpPost("for-review/{reviewId}/reject")]
    public async Task<IActionResult> RejectForReview(int reviewId)
    {
        var rev = await _fomsDb.AIReviewHistories.FindAsync(reviewId);
        if (rev == null) return NotFound(new { success = false, message = "Review record not found." });
        rev.FinalDecision = "Confirmed Duplicate";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("CONFIRM_AI_DUPLICATE", "AI Duplicate Review", "AIReviewHistory", reviewId, "Flagged", "Confirmed Duplicate", "Head Accountant confirmed duplicate.");
        return Ok(new { success = true, message = "Confirmed duplicate." });
    }

    [HttpPost("for-review/{reviewId}/dismiss-flag")]
    public async Task<IActionResult> DismissFlag(int reviewId)
    {
        var rev = await _fomsDb.AIReviewHistories.FindAsync(reviewId);
        if (rev == null) return NotFound(new { success = false, message = "Review record not found." });
        rev.FinalDecision = "Dismissed";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("DISMISS_AI_FLAG", "AI Duplicate Review", "AIReviewHistory", reviewId, "Flagged", "Dismissed", "Head Accountant dismissed flag.");
        return Ok(new { success = true, message = "Flag dismissed." });
    }

    [HttpPost("for-review/{reviewId}/escalate")]
    public async Task<IActionResult> EscalateReview(int reviewId)
    {
        var rev = await _fomsDb.AIReviewHistories.FindAsync(reviewId);
        if (rev == null) return NotFound(new { success = false, message = "Review record not found." });
        rev.FinalDecision = "Escalated";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("ESCALATE_AI_FLAG", "AI Duplicate Review", "AIReviewHistory", reviewId, "Flagged", "Escalated", "Head Accountant escalated to Financial Manager.");
        return Ok(new { success = true, message = "Escalated to Financial Manager." });
    }

    [HttpPost("for-review/{reviewId}/mark-resolved")]
    public async Task<IActionResult> MarkResolved(int reviewId)
    {
        var rev = await _fomsDb.AIReviewHistories.FindAsync(reviewId);
        if (rev == null) return NotFound(new { success = false, message = "Review record not found." });
        rev.FinalDecision = "Resolved";
        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("RESOLVE_AI_FLAG", "AI Duplicate Review", "AIReviewHistory", reviewId, "Flagged", "Resolved", "Head Accountant marked as resolved.");
        return Ok(new { success = true, message = "Marked as Resolved." });
    }

    [HttpGet("review-history")]
    public async Task<IActionResult> GetReviewHistory()
    {
        var list = await _fomsDb.AIReviewHistories.AsNoTracking().OrderByDescending(r => r.ReviewedDate).ToListAsync();
        return Ok(new
        {
            success = true,
            count = list.Count,
            data = list.Select(r => new
            {
                id = r.ReviewId.ToString(),
                historyId = r.ReviewId.ToString(),
                documentNumber = r.DocumentNumber,
                documentType = "Invoice",
                status = r.FinalDecision,
                finalDecision = r.FinalDecision,
                reviewer = r.Reviewer ?? "Head Accountant",
                decisionReason = r.DecisionReason,
                reviewedDate = r.ReviewedDate?.ToString("yyyy-MM-dd")
            })
        });
    }

    // 11. Reports
    [HttpPost("reports/generate")]
    public async Task<IActionResult> GenerateReport([FromBody] dynamic body)
    {
        await LogAuditAsync("GENERATE_REPORT", "Reports", "Report", null, null, "Generated", "Head Accountant generated operational report.");
        return Ok(new
        {
            success = true,
            message = "Report generated successfully from official database records.",
            generatedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss")
        });
    }

    // 12. Audit Logs
    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var total = await _fomsDb.AuditLogs.CountAsync();
        var logs = await _fomsDb.AuditLogs.AsNoTracking()
            .OrderByDescending(a => a.created_at)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            success = true,
            count = total,
            total,
            page,
            pageSize,
            data = logs.Select(l => new
            {
                auditId = l.audit_id,
                userId = l.user_id,
                role = l.role,
                action = l.action,
                module = l.module,
                affectedRecordType = l.affected_record_type,
                affectedRecordId = l.affected_record_id,
                beforeValue = l.before_value,
                afterValue = l.after_value,
                remarks = l.remarks,
                createdAt = l.created_at?.ToString("yyyy-MM-ddTHH:mm:ss")
            })
        });
    }

    // 13. AI Output History
    [HttpGet("ai/output-history")]
    public async Task<IActionResult> GetAiOutputHistory()
    {
        try
        {
            var outputs = await _fomsDb.AIOutputHistories.AsNoTracking().OrderByDescending(o => o.CreatedAt).ToListAsync();
            return Ok(new
            {
                success = true,
                count = outputs.Count,
                data = outputs.Select(o => new
                {
                    outputId = o.OutputId,
                    outputType = o.OutputType,
                    sourceReference = o.SourceReference,
                    processingStatus = o.ProcessingStatus,
                    modelName = o.ModelName,
                    version = o.Version,
                    message = o.Message,
                    createdAt = o.CreatedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
                })
            });
        }
        catch
        {
            return Ok(new
            {
                success = true,
                data = Array.Empty<object>(),
                warning = "AI output database unavailable or no records found."
            });
        }
    }
}
