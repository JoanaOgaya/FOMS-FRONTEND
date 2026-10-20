using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[ApiController]
[Route("api")]
public class FinancePaymentsController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public FinancePaymentsController(IApplicationDbContext _contextRef)
    {
        _context = _contextRef;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. SUBMIT SPEEDPAY PAYMENT
    // POST /api/speedpay/payments/submit
    // ─────────────────────────────────────────────────────────────────────────
    [AllowAnonymous]
    [HttpPost("speedpay/payments/submit")]
    public async Task<IActionResult> SubmitPayment([FromBody] SubmitPaymentRequest request)
    {
        if (request == null)
            return BadRequest(new { message = "Request body is required." });

        if (string.IsNullOrWhiteSpace(request.InvoiceId))
            return BadRequest(new { message = "InvoiceId is required." });

        if (request.Amount <= 0)
            return BadRequest(new { message = "Payment amount must be greater than zero." });

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == request.InvoiceId || i.InvoiceNo == request.InvoiceId);
        if (invoice == null)
            return NotFound(new { message = $"Invoice '{request.InvoiceId}' not found." });

        // Set status based on submission type
        // Manual uploads require manual review ("Submitted"), whereas digital transactions go straight to validation
        bool isDigital = !string.IsNullOrEmpty(request.SpeedPayReference) || !string.IsNullOrEmpty(request.PayMongoReference);
        string paymentStatus = isDigital ? "Pending Finance Validation" : "Submitted";
        string invoiceStatus = "Pending Payment Validation";

        var payment = new Payment
        {
            Id = Guid.NewGuid().ToString(),
            InvoiceId = invoice.Id,
            InvoiceNo = invoice.InvoiceNo,
            ClientId = invoice.ClientId,
            ClientName = invoice.ClientName,
            Amount = request.Amount,
            PaymentMethod = request.PaymentMethod ?? "SpeedPay (PayMongo)",
            ReferenceNumber = request.ReferenceNumber ?? Guid.NewGuid().ToString("N").Substring(0, 12).ToUpper(),
            SpeedPayReference = request.SpeedPayReference,
            PayMongoReference = request.PayMongoReference,
            PaymentStatus = paymentStatus,
            SubmittedAt = DateTime.UtcNow,
            PaymentDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Remarks = request.Remarks ?? "Payment submitted through SpeedPay Portal.",
            ProofImageUrl = request.ProofImageUrl,
            RecordedBy = "SpeedPay Client Portal"
        };

        invoice.PaymentStatus = invoiceStatus;
        invoice.PaymentValidationStatus = isDigital ? "Pending Validation" : "Submitted for Review";
        invoice.UpdatedBy = "SpeedPay Gateway";

        _context.Payments.Add(payment);

        // Payment History
        var history = new PaymentHistory
        {
            Id = Guid.NewGuid().ToString(),
            PaymentId = payment.Id,
            InvoiceId = invoice.Id,
            Status = isDigital ? "Pending Validation" : "Payment Submitted",
            Action = "Payment Submitted",
            Remarks = isDigital ? "SpeedPay digital payment submitted. Awaiting final validation." : "Manual payment proof uploaded. Awaiting initial manual review.",
            PerformedBy = "System",
            PerformedRole = "Client",
            CreatedAt = DateTime.UtcNow
        };
        _context.PaymentHistories.Add(history);

        // Audit Log
        var audit = new AuditLog
        {
            Id = Guid.NewGuid().ToString(),
            UserId = "Client",
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = "Payment Submission",
            Details = $"Submitted {payment.Amount:N2} via {payment.PaymentMethod} for Invoice {invoice.InvoiceNo}.",
            LoggedAt = DateTime.UtcNow,
            BeforeValue = $"Invoice Balance: {invoice.Balance:N2} | Status: Unpaid",
            AfterValue = $"Invoice Balance: {invoice.Balance:N2} | Status: Pending Payment Validation"
        };
        await _context.AuditLogs.AddAsync(audit);

        // Notifications
        string targetRole = isDigital ? "Financial Manager" : "Accountant";
        var notif = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            Type = "PAYMENT_VALIDATION_REQUIRED",
            Title = "Payment Needs Validation",
            Description = $"A SpeedPay payment for Invoice {invoice.InvoiceNo} is pending validation.",
            InvoiceNo = invoice.InvoiceNo,
            RecipientRole = targetRole,
            RelatedPaymentId = payment.Id,
            RelatedInvoiceId = invoice.Id,
            Read = false,
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            Source = "SpeedPay Gateway"
        };
        _context.Notifications.Add(notif);

        // Also add notifications for Head Accountant if it's digital validation
        if (isDigital)
        {
            var notifHa = new Notification
            {
                Id = Guid.NewGuid().ToString(),
                Type = "PAYMENT_VALIDATION_REQUIRED",
                Title = "Payment Needs Validation",
                Description = $"A SpeedPay payment for Invoice {invoice.InvoiceNo} is pending validation.",
                InvoiceNo = invoice.InvoiceNo,
                RecipientRole = "Head Accountant",
                RelatedPaymentId = payment.Id,
                RelatedInvoiceId = invoice.Id,
                Read = false,
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                Source = "SpeedPay Gateway"
            };
            _context.Notifications.Add(notifHa);
        }

        await _context.SaveChangesAsync(default);

        return Created($"/api/payments/{payment.Id}", new
        {
            payment.Id,
            payment.PaymentStatus,
            payment.SubmittedAt,
            message = "Payment submission received. Pending review/validation."
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. VALIDATE PAYMENT
    // POST /api/finance/payments/{paymentId}/validate
    // ─────────────────────────────────────────────────────────────────────────
    [Authorize]
    [HttpPost("finance/payments/{paymentId}/validate")]
    public async Task<IActionResult> ValidatePayment(string paymentId, [FromBody] ValidationActionRequest request)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "Unknown Role";
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";

        if (role != "Financial Manager" && role != "Head Accountant")
            return StatusCode(403, new { message = "Only Financial Manager and Head Accountant are authorized to validate payments." });

        var payment = await _context.Payments.FirstOrDefaultAsync(p => p.Id == paymentId);
        if (payment == null)
            return NotFound(new { message = $"Payment record '{paymentId}' not found." });

        if (payment.PaymentStatus == "Validated")
            return BadRequest(new { message = "This payment has already been validated." });

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == payment.InvoiceId);
        if (invoice == null)
            return NotFound(new { message = $"Associated Invoice '{payment.InvoiceId}' not found." });

        decimal beforeBalance = invoice.Balance;
        string beforeStatus = invoice.PaymentStatus;

        using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            // Perform computation updates
            invoice.AmountPaid += payment.Amount;
            BillingComputationService.RecalculateInvoice(invoice);
            invoice.UpdatedBy = user;
            invoice.PaymentValidationStatus = "Validated";
            invoice.PaymentStatus = invoice.Balance <= 0 ? "Paid" : "Unpaid";

        payment.PaymentStatus = "Validated";
        payment.ValidatedAt = DateTime.UtcNow;
        payment.ValidatedBy = user;
        payment.Remarks = request.Remarks ?? payment.Remarks;

        // Generate next OR number for the validation
        var orNum = await GenerateNextOrNumberAsync();
        payment.OrNumber = orNum;

        // Create Official Receipt and PaymentCollection records
        var paymentCollection = new PaymentCollection
        {
            InvoiceId = invoice.Id,
            CollectedDate = DateTime.UtcNow,
            AmountCollected = payment.Amount,
            PaymentMethod = payment.PaymentMethod,
            Status = "Completed"
        };
        _context.PaymentCollections.Add(paymentCollection);

        var officialReceipt = new OfficialReceipt
        {
            PaymentCollectionId = paymentCollection.Id,
            ReceiptNumber = orNum,
            IssuedDate = DateTime.UtcNow
        };
        _context.OfficialReceipts.Add(officialReceipt);

        // Update Accounts Receivable (ReceivableBalance)
        var receivable = await _context.ReceivableBalances.FirstOrDefaultAsync(r => r.InvoiceId == invoice.Id);
        if (receivable != null)
        {
            receivable.BalanceAmount = invoice.Balance;
            receivable.PaidAmount += payment.Amount;
            receivable.LastPaymentDate = DateTime.UtcNow;
            receivable.Status = invoice.Balance <= 0 ? "Paid" : "Unpaid";
            _context.ReceivableBalances.Update(receivable);
        }
        else if (invoice.Balance > 0)
        {
            receivable = new ReceivableBalance
            {
                ClientId = invoice.ClientId,
                InvoiceId = invoice.Id,
                BalanceAmount = invoice.Balance,
                PaidAmount = payment.Amount,
                LastPaymentDate = DateTime.UtcNow,
                Status = "Unpaid",
                DueDate = DateTime.TryParse(invoice.DueDate, out var parsedDue) ? parsedDue : DateTime.UtcNow.AddDays(30)
            };
            _context.ReceivableBalances.Add(receivable);
        }

        // Sync client balance
        await BillingComputationService.SyncClientBalanceAsync(invoice.ClientId, _context, default);

        // Payment History
        var history = new PaymentHistory
        {
            Id = Guid.NewGuid().ToString(),
            PaymentId = payment.Id,
            InvoiceId = invoice.Id,
            Status = "Validated",
            Action = "Validate Payment",
            Remarks = request.Remarks ?? $"Payment validated by {role}.",
            PerformedBy = user,
            PerformedRole = role,
            CreatedAt = DateTime.UtcNow
        };
        _context.PaymentHistories.Add(history);

        // Audit Log
        var audit = new AuditLog
        {
            Id = Guid.NewGuid().ToString(),
            UserId = user,
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = "Validate Payment",
            Details = $"Validated payment of {payment.Amount:N2} for Invoice {invoice.InvoiceNo}. OR: {orNum}.",
            LoggedAt = DateTime.UtcNow,
            BeforeValue = $"Invoice Balance: {beforeBalance:N2} | Status: {beforeStatus}",
            AfterValue = $"Invoice Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}"
        };
        await _context.AuditLogs.AddAsync(audit);

        // Notify client or billing creator
        var notif = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            Type = "success",
            Title = "Payment Validated",
            Description = $"Your payment of {payment.Amount:N2} for Invoice {invoice.InvoiceNo} has been validated successfully.",
            InvoiceNo = invoice.InvoiceNo,
            RecipientUserId = invoice.ClientId,
            RecipientRole = "Client",
            RelatedPaymentId = payment.Id,
            RelatedInvoiceId = invoice.Id,
            Read = false,
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            Source = "Finance Department"
        };
        _context.Notifications.Add(notif);

        await _context.SaveChangesAsync(default);
        await transaction.CommitAsync();

        return Ok(new
        {
            PaymentId = payment.Id,
            PaymentStatus = payment.PaymentStatus,
            InvoicePaymentStatus = invoice.PaymentStatus,
            OfficialReceipt = orNum,
            message = "Payment successfully validated and applied."
        });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            return StatusCode(500, new { message = "An error occurred while validating the payment. Transaction rolled back.", details = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. REJECT PAYMENT
    // POST /api/finance/payments/{paymentId}/reject
    // ─────────────────────────────────────────────────────────────────────────
    [Authorize]
    [HttpPost("finance/payments/{paymentId}/reject")]
    public async Task<IActionResult> RejectPayment(string paymentId, [FromBody] RejectionRequest request)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "Unknown Role";
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";

        if (role != "Financial Manager" && role != "Head Accountant")
            return StatusCode(403, new { message = "Only Financial Manager and Head Accountant are authorized to reject payments." });

        if (request == null || string.IsNullOrWhiteSpace(request.RejectionReason))
            return BadRequest(new { message = "RejectionReason is required." });

        var payment = await _context.Payments.FirstOrDefaultAsync(p => p.Id == paymentId);
        if (payment == null)
            return NotFound(new { message = $"Payment record '{paymentId}' not found." });

        if (payment.PaymentStatus == "Validated")
            return BadRequest(new { message = "Cannot reject a payment that has already been validated." });

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == payment.InvoiceId);
        if (invoice != null)
        {
            invoice.PaymentStatus = invoice.Balance <= 0 ? "Paid" : "Unpaid";
            invoice.PaymentValidationStatus = "Rejected";
            invoice.UpdatedBy = user;
            _context.Invoices.Update(invoice);
        }

        payment.PaymentStatus = "Rejected";
        payment.RejectedAt = DateTime.UtcNow;
        payment.RejectedBy = user;
        payment.RejectionReason = request.RejectionReason;

        // Payment History
        var history = new PaymentHistory
        {
            Id = Guid.NewGuid().ToString(),
            PaymentId = payment.Id,
            InvoiceId = payment.InvoiceId,
            Status = "Rejected",
            Action = "Reject Payment",
            Remarks = $"Rejected by {role}. Reason: {request.RejectionReason}",
            PerformedBy = user,
            PerformedRole = role,
            CreatedAt = DateTime.UtcNow
        };
        _context.PaymentHistories.Add(history);

        // Audit Log
        var audit = new AuditLog
        {
            Id = Guid.NewGuid().ToString(),
            UserId = user,
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = "Reject Payment",
            Details = $"Rejected payment of {payment.Amount:N2} for Invoice {payment.InvoiceNo}. Reason: {request.RejectionReason}",
            LoggedAt = DateTime.UtcNow
        };
        await _context.AuditLogs.AddAsync(audit);

        // Notification to client
        var notif = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            Type = "alert",
            Title = "Payment Rejected",
            Description = $"Your payment of {payment.Amount:N2} for Invoice {payment.InvoiceNo} was rejected. Reason: {request.RejectionReason}",
            InvoiceNo = payment.InvoiceNo,
            RecipientUserId = payment.ClientId,
            RecipientRole = "Client",
            RelatedPaymentId = payment.Id,
            RelatedInvoiceId = payment.InvoiceId,
            Read = false,
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            Source = "Finance Department"
        };
        _context.Notifications.Add(notif);

        await _context.SaveChangesAsync(default);

        return Ok(new
        {
            payment.Id,
            payment.PaymentStatus,
            message = "Payment rejected."
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. RETURN PAYMENT FOR CORRECTION
    // POST /api/finance/payments/{paymentId}/return
    // ─────────────────────────────────────────────────────────────────────────
    [Authorize]
    [HttpPost("finance/payments/{paymentId}/return")]
    public async Task<IActionResult> ReturnPayment(string paymentId, [FromBody] ValidationActionRequest request)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "Unknown Role";
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";

        if (role != "Financial Manager" && role != "Head Accountant")
            return StatusCode(403, new { message = "Only Financial Manager and Head Accountant are authorized to return payments." });

        var payment = await _context.Payments.FirstOrDefaultAsync(p => p.Id == paymentId);
        if (payment == null)
            return NotFound(new { message = $"Payment record '{paymentId}' not found." });

        if (payment.PaymentStatus == "Validated")
            return BadRequest(new { message = "Cannot return a payment that has already been validated." });

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == payment.InvoiceId);
        if (invoice != null)
        {
            invoice.PaymentValidationStatus = "Returned for Correction";
            invoice.UpdatedBy = user;
            _context.Invoices.Update(invoice);
        }

        payment.PaymentStatus = "Returned / Needs Correction";
        payment.Remarks = request.Remarks ?? "Returned for correction by finance validation.";

        // Payment History
        var history = new PaymentHistory
        {
            Id = Guid.NewGuid().ToString(),
            PaymentId = payment.Id,
            InvoiceId = payment.InvoiceId,
            Status = "Returned for Correction",
            Action = "Return Payment",
            Remarks = request.Remarks ?? "Returned for correction.",
            PerformedBy = user,
            PerformedRole = role,
            CreatedAt = DateTime.UtcNow
        };
        _context.PaymentHistories.Add(history);

        // Audit Log
        var audit = new AuditLog
        {
            Id = Guid.NewGuid().ToString(),
            UserId = user,
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = "Return Payment",
            Details = $"Returned payment of {payment.Amount:N2} for Invoice {payment.InvoiceNo} for correction.",
            LoggedAt = DateTime.UtcNow
        };
        await _context.AuditLogs.AddAsync(audit);

        // Notification to client
        var notif = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            Type = "info",
            Title = "Payment Correction Required",
            Description = $"Your payment of {payment.Amount:N2} for Invoice {payment.InvoiceNo} requires corrections. Remarks: {payment.Remarks}",
            InvoiceNo = payment.InvoiceNo,
            RecipientUserId = payment.ClientId,
            RecipientRole = "Client",
            RelatedPaymentId = payment.Id,
            RelatedInvoiceId = payment.InvoiceId,
            Read = false,
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            Source = "Finance Department"
        };
        _context.Notifications.Add(notif);

        await _context.SaveChangesAsync(default);

        return Ok(new
        {
            payment.Id,
            payment.PaymentStatus,
            message = "Payment returned for correction."
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. MANUAL REVIEW STEP
    // POST /api/finance/payments/{paymentId}/review
    // ─────────────────────────────────────────────────────────────────────────
    [Authorize]
    [HttpPost("finance/payments/{paymentId}/review")]
    public async Task<IActionResult> ReviewPayment(string paymentId, [FromBody] ManualReviewActionRequest request)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "Unknown Role";
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";

        var allowedRoles = new[] { "Accountant", "Assistant Financial Manager", "Assistant Finance Manager", "Assistant of Financial Manager", "Coordinator" };
        if (!allowedRoles.Contains(role))
            return StatusCode(403, new { message = "Only Accountant, Assistant Financial Manager, or Coordinator are authorized for initial review." });

        if (request == null || string.IsNullOrWhiteSpace(request.Status))
            return BadRequest(new { message = "Status (Pending Finance Validation or Returned / Needs Correction) is required." });

        var allowedStatus = new[] { "Pending Finance Validation", "Returned / Needs Correction" };
        if (!allowedStatus.Contains(request.Status))
            return BadRequest(new { message = $"Invalid status '{request.Status}'. Allowed: {string.Join(", ", allowedStatus)}" });

        var payment = await _context.Payments.FirstOrDefaultAsync(p => p.Id == paymentId);
        if (payment == null)
            return NotFound(new { message = $"Payment record '{paymentId}' not found." });

        if (payment.PaymentStatus == "Validated" || payment.PaymentStatus == "Pending Finance Validation")
            return BadRequest(new { message = $"Cannot review payment in its current state: '{payment.PaymentStatus}'." });

        payment.PaymentStatus = request.Status;
        payment.Remarks = request.Remarks ?? payment.Remarks;

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == payment.InvoiceId);
        if (invoice != null)
        {
            invoice.PaymentValidationStatus = request.Status == "Pending Finance Validation" ? "Pending Validation" : "Returned for Correction";
            invoice.UpdatedBy = user;
            _context.Invoices.Update(invoice);
        }

        // Payment History
        var history = new PaymentHistory
        {
            Id = Guid.NewGuid().ToString(),
            PaymentId = payment.Id,
            InvoiceId = payment.InvoiceId,
            Status = request.Status == "Pending Finance Validation" ? "Under Finance Review" : "Returned for Correction",
            Action = "Manual Review",
            Remarks = request.Remarks ?? $"Manual check completed. Marked as {request.Status}.",
            PerformedBy = user,
            PerformedRole = role,
            CreatedAt = DateTime.UtcNow
        };
        _context.PaymentHistories.Add(history);

        // Audit Log
        var audit = new AuditLog
        {
            Id = Guid.NewGuid().ToString(),
            UserId = user,
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = "Manual Review",
            Details = $"Reviewed payment of {payment.Amount:N2} for Invoice {payment.InvoiceNo}. Forwarded as: {request.Status}.",
            LoggedAt = DateTime.UtcNow
        };
        await _context.AuditLogs.AddAsync(audit);

        // If ready for validation, notify FM & HA
        if (request.Status == "Pending Finance Validation")
        {
            var notifFm = new Notification
            {
                Id = Guid.NewGuid().ToString(),
                Type = "PAYMENT_VALIDATION_REQUIRED",
                Title = "Payment Needs Validation",
                Description = $"A SpeedPay payment for Invoice {invoice?.InvoiceNo} has passed manual check and is ready for validation.",
                InvoiceNo = invoice?.InvoiceNo,
                RecipientRole = "Financial Manager",
                RelatedPaymentId = payment.Id,
                RelatedInvoiceId = invoice?.Id,
                Read = false,
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                Source = "Manual Review Module"
            };
            _context.Notifications.Add(notifFm);

            var notifHa = new Notification
            {
                Id = Guid.NewGuid().ToString(),
                Type = "PAYMENT_VALIDATION_REQUIRED",
                Title = "Payment Needs Validation",
                Description = $"A SpeedPay payment for Invoice {invoice?.InvoiceNo} has passed manual check and is ready for validation.",
                InvoiceNo = invoice?.InvoiceNo,
                RecipientRole = "Head Accountant",
                RelatedPaymentId = payment.Id,
                RelatedInvoiceId = invoice?.Id,
                Read = false,
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                Source = "Manual Review Module"
            };
            _context.Notifications.Add(notifHa);
        }

        await _context.SaveChangesAsync(default);

        return Ok(new
        {
            payment.Id,
            payment.PaymentStatus,
            message = $"Payment review complete. Status updated to '{request.Status}'."
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. GET UNIFIED PENDING VALIDATION QUEUE (FM & HA Only)
    // GET /api/finance/payments/pending-validation
    // ─────────────────────────────────────────────────────────────────────────
    [Authorize]
    [HttpGet("finance/payments/pending-validation")]
    public async Task<IActionResult> GetPendingValidationQueue()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "Unknown Role";
        if (role != "Financial Manager" && role != "Head Accountant")
            return StatusCode(403, new { message = "Access denied: Unauthorized role." });

        var queue = await _context.Payments
            .AsNoTracking()
            .Where(p => p.PaymentStatus == "Pending Finance Validation")
            .OrderByDescending(p => p.SubmittedAt)
            .ToListAsync();

        return Ok(queue);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. GET PAYMENT HISTORY (ALL ATTEMPTS)
    // GET /api/payments/history/{invoiceId}
    // ─────────────────────────────────────────────────────────────────────────
    [AllowAnonymous]
    [HttpGet("payments/history/{invoiceId}")]
    public async Task<IActionResult> GetPaymentHistory(string invoiceId)
    {
        var history = await _context.PaymentHistories
            .AsNoTracking()
            .Where(h => h.InvoiceId == invoiceId || h.PaymentId == invoiceId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();

        return Ok(history);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. GET FINANCE VALIDATION NOTIFICATIONS
    // GET /api/notifications/finance
    // ─────────────────────────────────────────────────────────────────────────
    [Authorize]
    [HttpGet("notifications/finance")]
    public async Task<IActionResult> GetFinanceNotifications()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "";
        if (role != "Financial Manager" && role != "Head Accountant" && role != "Accountant")
            return StatusCode(403, new { message = "Unauthorized access." });

        var notifications = await _context.Notifications
            .AsNoTracking()
            .Where(n => n.RecipientRole == role && n.Type == "PAYMENT_VALIDATION_REQUIRED" && !n.Read)
            .OrderByDescending(n => n.CreatedAt)
            .ToListAsync();

        return Ok(notifications);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    private async Task<string> GenerateNextOrNumberAsync()
    {
        var currentYear = DateTime.UtcNow.Year;
        var yearPrefix = $"OR-{currentYear}-";

        var lastPayment = await _context.Payments
            .AsNoTracking()
            .Where(p => p.OrNumber != null && p.OrNumber.StartsWith(yearPrefix))
            .OrderByDescending(p => p.OrNumber)
            .FirstOrDefaultAsync();

        int nextSeqNum = 1;
        if (lastPayment != null && lastPayment.OrNumber.Length > yearPrefix.Length)
        {
            var seqPart = lastPayment.OrNumber.Substring(yearPrefix.Length);
            if (int.TryParse(seqPart, out var lastSeq))
            {
                nextSeqNum = lastSeq + 1;
            }
        }

        return $"{yearPrefix}{nextSeqNum:D4}";
    }

    // Request DTOs
    public record SubmitPaymentRequest(
        string InvoiceId,
        decimal Amount,
        string? PaymentMethod,
        string? ReferenceNumber,
        string? SpeedPayReference,
        string? PayMongoReference,
        string? ProofImageUrl,
        string? Remarks
    );

    public record ValidationActionRequest(string? Remarks);
    public record RejectionRequest(string RejectionReason);
    public record ManualReviewActionRequest(string Status, string? Remarks);
}
