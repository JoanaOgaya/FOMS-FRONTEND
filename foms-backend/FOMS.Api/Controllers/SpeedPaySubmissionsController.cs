using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

/// <summary>
/// Manual SpeedPay submission endpoints.
/// Allows the SpeedPay client portal to submit manual proof-of-payment
/// and the Finance Manager to view and validate those submissions.
/// </summary>
[ApiController]
[Route("api/speedpay/submissions")]
[Route("api/v1/speedpay/submissions")]
[Route("speedpay/submissions")]
public class SpeedPaySubmissionsController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public SpeedPaySubmissionsController(IApplicationDbContext context)
    {
        _context = context;
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _context.SpeedPayManualSubmissions.AnyAsync())
            {
                var samples = new List<SpeedPayManualSubmission>
                {
                    new()
                    {
                        Id = "SP-SUB-001",
                        InvoiceId = "INV-001",
                        InvoiceNumber = "LZD-2026-0001",
                        ClientId = "CA-001",
                        ClientName = "Lazada Philippines",
                        PaymentMethod = "GCash",
                        ReferenceNumber = "GCASH-8829104",
                        AmountPaid = 25000m,
                        ProofFileName = "gcash_receipt_8829104.png",
                        ProofFileUrl = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&auto=format&fit=crop&q=80",
                        Status = "Pending Validation",
                        SubmittedAt = DateTime.UtcNow.AddHours(-3)
                    },
                    new()
                    {
                        Id = "SP-SUB-002",
                        InvoiceId = "INV-002",
                        InvoiceNumber = "BI-2026-0001",
                        ClientId = "CA-001",
                        ClientName = "Lazada Philippines",
                        PaymentMethod = "Maya",
                        ReferenceNumber = "MAYA-4491023",
                        AmountPaid = 30000m,
                        ProofFileName = "maya_proof_4491023.jpg",
                        ProofFileUrl = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&auto=format&fit=crop&q=80",
                        Status = "Pending Validation",
                        SubmittedAt = DateTime.UtcNow.AddHours(-8)
                    },
                    new()
                    {
                        Id = "SP-SUB-003",
                        InvoiceId = "INV-003",
                        InvoiceNumber = "SHP-2026-0001",
                        ClientId = "CA-002",
                        ClientName = "Shopee Philippines",
                        PaymentMethod = "Maya",
                        ReferenceNumber = "MAYA-992014",
                        AmountPaid = 42500m,
                        ProofFileName = "maya_transfer_992014.pdf",
                        ProofFileUrl = "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&auto=format&fit=crop&q=80",
                        Status = "Validated",
                        SubmittedAt = DateTime.UtcNow.AddDays(-1)
                    }
                };
                _context.SpeedPayManualSubmissions.AddRange(samples);
                await _context.SaveChangesAsync(default);
            }
            else
            {
                var nonSupported = await _context.SpeedPayManualSubmissions
                    .Where(s => s.PaymentMethod != "GCash" && s.PaymentMethod != "Maya")
                    .ToListAsync();
                if (nonSupported.Any())
                {
                    foreach (var s in nonSupported)
                    {
                        s.PaymentMethod = "Maya";
                    }
                    await _context.SaveChangesAsync(default);
                }
            }
        }
        catch { }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // POST api/speedpay/submissions
    // Called by SpeedPay Portal when a client uploads proof of payment
    // ──────────────────────────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] SubmitRequest request)
    {
        if (request == null) return BadRequest(new { message = "Request body is required." });
        if (string.IsNullOrWhiteSpace(request.InvoiceId)) return BadRequest(new { message = "InvoiceId is required." });
        if (request.AmountPaid <= 0) return BadRequest(new { message = "AmountPaid must be greater than 0." });

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == request.InvoiceId || i.InvoiceNo == request.InvoiceId);
        if (invoice == null)
            return NotFound(new { message = $"Invoice '{request.InvoiceId}' not found." });

        var submission = new SpeedPayManualSubmission
        {
            Id = Guid.NewGuid().ToString(),
            InvoiceId = invoice.Id,
            InvoiceNumber = invoice.InvoiceNo,
            ClientId = request.ClientId ?? invoice.ClientId,
            ClientName = request.ClientName ?? invoice.ClientName,
            PaymentMethod = request.PaymentMethod ?? "GCash",
            ReferenceNumber = request.ReferenceNumber ?? Guid.NewGuid().ToString("N").Substring(0, 12).ToUpper(),
            AmountPaid = request.AmountPaid,
            ProofFileName = request.ProofFileName ?? "proof.jpg",
            ProofFileUrl = request.ProofFileUrl,
            Status = "Pending Finance Validation",
            SubmittedAt = DateTime.UtcNow,
        };

        await _context.SpeedPayManualSubmissions.AddAsync(submission);

        // Also create a record in the Payments table for manual review
        var payment = new Payment
        {
            Id = submission.Id, // Link IDs directly for simple tracking
            OrNumber = $"PENDING-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", // temp; replaced on validation
            InvoiceId = invoice.Id,
            InvoiceNo = invoice.InvoiceNo,
            ClientId = invoice.ClientId,
            ClientName = invoice.ClientName,
            Amount = request.AmountPaid,
            PaymentMethod = submission.PaymentMethod,
            ReferenceNumber = submission.ReferenceNumber,
            ProofImageUrl = submission.ProofFileUrl,
            Remarks = "Manual payment submission proof uploaded.",
            PaymentStatus = "Pending Finance Validation", // Awaiting final finance validation
            SubmittedAt = DateTime.UtcNow,
            PaymentDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            RecordedBy = submission.ClientName
        };
        await _context.Payments.AddAsync(payment);

        invoice.PaymentStatus = "Pending Payment Validation";
        invoice.PaymentValidationStatus = "Submitted for Review";
        _context.Invoices.Update(invoice);

        // Payment History
        var history = new PaymentHistory
        {
            Id = Guid.NewGuid().ToString(),
            PaymentId = payment.Id,
            InvoiceId = invoice.Id,
            Status = "Pending Finance Validation",
            Action = "Payment Submitted",
            Remarks = "Manual payment proof uploaded. Pending finance validation.",
            PerformedBy = submission.ClientName,
            PerformedRole = "Client",
            CreatedAt = DateTime.UtcNow
        };
        _context.PaymentHistories.Add(history);

        // Notifications
        var notif1 = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            Type = "PAYMENT_VALIDATION_REQUIRED",
            Title = "Payment Needs Validation",
            Description = $"A SpeedPay payment for Invoice {invoice.InvoiceNo} is pending finance validation.",
            InvoiceNo = invoice.InvoiceNo,
            RecipientRole = "Financial Manager",
            RelatedPaymentId = payment.Id,
            RelatedInvoiceId = invoice.Id,
            Read = false,
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            Source = "SpeedPay Gateway"
        };
        var notif2 = new Notification
        {
            Id = Guid.NewGuid().ToString(),
            Type = "PAYMENT_VALIDATION_REQUIRED",
            Title = "Payment Needs Validation",
            Description = $"A SpeedPay payment for Invoice {invoice.InvoiceNo} is pending finance validation.",
            InvoiceNo = invoice.InvoiceNo,
            RecipientRole = "Head Accountant",
            RelatedPaymentId = payment.Id,
            RelatedInvoiceId = invoice.Id,
            Read = false,
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
            Source = "SpeedPay Gateway"
        };
        _context.Notifications.Add(notif1);
        _context.Notifications.Add(notif2);

        await _context.SaveChangesAsync(default);

        return CreatedAtAction(nameof(GetById), new { id = submission.Id }, new
        {
            submission.Id,
            submission.Status,
            submission.SubmittedAt,
            message = "Payment submission received. Pending Finance validation."
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET api/speedpay/submissions
    // Returns all manual submissions for the Finance Manager dashboard
    // ──────────────────────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status = null)
    {
        await EnsureSeededAsync();
        var query = _context.SpeedPayManualSubmissions.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(s => s.Status == status);

        var results = await query
            .OrderByDescending(s => s.SubmittedAt)
            .Select(s => new
            {
                s.Id,
                s.InvoiceId,
                s.InvoiceNumber,
                s.ClientId,
                s.ClientName,
                s.PaymentMethod,
                s.ReferenceNumber,
                s.AmountPaid,
                s.ProofFileName,
                s.ProofFileUrl,
                s.Status,
                s.SubmittedAt,
            })
            .ToListAsync();

        return Ok(results);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET api/speedpay/submissions/{id}
    // ──────────────────────────────────────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var submission = await _context.SpeedPayManualSubmissions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id);

        if (submission == null) return NotFound(new { message = $"Submission '{id}' not found." });
        return Ok(submission);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PUT api/speedpay/submissions/{id}/status
    // Finance Manager validates or rejects a submission
    // Body: { "status": "Validated" | "Rejected", "remarks": "..." }
    // ──────────────────────────────────────────────────────────────────────────
    [HttpPut("{id}/status")]
    [HttpPut("{id}")]
    [HttpPost("{id}/verify")]
    [HttpPost("{id}/{actionName}")]
    public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateStatusRequest? request, string? actionName = null)
    {
        var submission = await _context.SpeedPayManualSubmissions.FirstOrDefaultAsync(s => s.Id == id);
        if (submission == null) return NotFound(new { message = $"Submission '{id}' not found." });

        request ??= new UpdateStatusRequest();
        var remarks = request.Remarks ?? request.Notes;
        var status = request.Status;

        if (string.IsNullOrEmpty(status))
        {
            status = actionName?.ToLower() switch
            {
                "reject" => "Rejected",
                "return" => "Returned / Needs Correction",
                "submit" => "Pending Finance Validation",
                _ => "Validated"
            };
        }

        var allowed = new[] { "Validated", "Rejected", "Pending Finance Validation", "Returned / Needs Correction" };
        if (!allowed.Contains(status))
            return BadRequest(new { message = $"Invalid status '{status}'. Allowed: {string.Join(", ", allowed)}" });

        submission.Status = status;

        // Sync with payments table
        var payment = await _context.Payments.FirstOrDefaultAsync(p => p.Id == submission.Id);
        if (payment == null)
        {
            payment = new Payment
            {
                Id = submission.Id,
                InvoiceId = submission.InvoiceId,
                InvoiceNo = submission.InvoiceNumber,
                ClientId = submission.ClientId,
                ClientName = submission.ClientName,
                Amount = submission.AmountPaid,
                PaymentMethod = submission.PaymentMethod,
                ReferenceNumber = submission.ReferenceNumber,
                ProofImageUrl = submission.ProofFileUrl,
                Remarks = request.Remarks ?? "Manual submission status updated.",
                PaymentStatus = request.Status ?? "Under Review",
                SubmittedAt = submission.SubmittedAt,
                PaymentDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd")
            };
            await _context.Payments.AddAsync(payment);
        }
        else
        {
            payment.PaymentStatus = request.Status ?? "Under Review";
            if (request.Status == "Rejected") {
                payment.RejectionReason = request.Remarks ?? "Manual submission rejected.";
                payment.RejectedAt = DateTime.UtcNow;
                payment.RejectedBy = "Finance Manager"; // ToDo: Grab actual user identity
            }
            if (!string.IsNullOrWhiteSpace(request.Remarks)) {
                payment.Remarks = request.Remarks;
            }
        }

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == submission.InvoiceId);

        using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
        if (request.Status == "Validated")
        {
            if (invoice != null)
            {
                decimal beforeBalance = invoice.Balance;
                string beforeStatus = invoice.PaymentStatus;

                invoice.AmountPaid += submission.AmountPaid;
                BillingComputationService.RecalculateInvoice(invoice);
                invoice.UpdatedBy = "Finance Manager";
                invoice.PaymentValidationStatus = "Validated";
                invoice.PaymentStatus = invoice.Balance <= 0 ? "Paid" : "Unpaid";

                // Generate OR
                var orNum = await GenerateNextOrNumberAsync();
                payment.OrNumber = orNum;

                // Create official receipt and collection records
                var paymentCollection = new PaymentCollection
                {
                    InvoiceId = invoice.Id,
                    CollectedDate = DateTime.UtcNow,
                    AmountCollected = submission.AmountPaid,
                    PaymentMethod = submission.PaymentMethod,
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

                // Sync AR (ReceivableBalance)
                var receivable = await _context.ReceivableBalances.FirstOrDefaultAsync(r => r.InvoiceId == invoice.Id);
                if (receivable != null)
                {
                    receivable.BalanceAmount = invoice.Balance;
                    receivable.PaidAmount += submission.AmountPaid;
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
                        PaidAmount = submission.AmountPaid,
                        LastPaymentDate = DateTime.UtcNow,
                        Status = "Unpaid",
                        DueDate = DateTime.TryParse(invoice.DueDate, out var parsedDue) ? parsedDue : DateTime.UtcNow.AddDays(30)
                    };
                    _context.ReceivableBalances.Add(receivable);
                }

                // Sync Client Account balance
                await BillingComputationService.SyncClientBalanceAsync(invoice.ClientId, _context, default);

                // Payment History
                var history = new PaymentHistory
                {
                    Id = Guid.NewGuid().ToString(),
                    PaymentId = payment.Id,
                    InvoiceId = invoice.Id,
                    Status = "Validated",
                    Action = "Validate Payment",
                    Remarks = request.Remarks ?? "Manual submission validated by Finance Manager.",
                    PerformedBy = "Finance Manager",
                    PerformedRole = "Financial Manager",
                    CreatedAt = DateTime.UtcNow
                };
                _context.PaymentHistories.Add(history);

                // Audit Log
                var audit = new AuditLog
                {
                    Id = Guid.NewGuid().ToString(),
                    UserId = "Finance Manager",
                    EntityName = "Payment",
                    EntityId = payment.Id,
                    Action = "Validate Payment",
                    Details = $"Validated manual payment of {submission.AmountPaid:N2} for Invoice {invoice.InvoiceNo}.",
                    LoggedAt = DateTime.UtcNow,
                    BeforeValue = $"Balance: {beforeBalance:N2} | Status: {beforeStatus}",
                    AfterValue = $"Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}"
                };
                await _context.AuditLogs.AddAsync(audit);

                // Notify the client: payment validated
                var notifValidated = new Notification
                {
                    Id = Guid.NewGuid().ToString(),
                    Type = "success",
                    Title = "Payment Validated",
                    Description = $"Your payment of \u20b1{submission.AmountPaid:N2} for Invoice {invoice.InvoiceNo} has been validated and marked as Paid.",
                    InvoiceNo = invoice.InvoiceNo,
                    RecipientUserId = submission.ClientId,
                    RecipientRole = "Client",
                    RelatedPaymentId = payment.Id,
                    RelatedInvoiceId = invoice.Id,
                    Read = false,
                    Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                    Source = "Finance Department",
                    CreatedAt = DateTime.UtcNow
                };
                _context.Notifications.Add(notifValidated);
            }
        }
        else if (request.Status == "Rejected")
        {
            if (invoice != null)
            {
                invoice.PaymentStatus = invoice.Balance <= 0 ? "Paid" : "Unpaid";
                invoice.PaymentValidationStatus = "Rejected";
                _context.Invoices.Update(invoice);

                var history = new PaymentHistory
                {
                    Id = Guid.NewGuid().ToString(),
                    PaymentId = payment.Id,
                    InvoiceId = invoice.Id,
                    Status = "Rejected",
                    Action = "Reject Payment",
                    Remarks = request.Remarks ?? "Manual submission rejected.",
                    PerformedBy = "Finance Manager",
                    PerformedRole = "Financial Manager",
                    CreatedAt = DateTime.UtcNow
                };
                _context.PaymentHistories.Add(history);

                // Notify the client: payment rejected
                var rejectionMessage = !string.IsNullOrWhiteSpace(request.Remarks)
                    ? $"Payment failed due to: {request.Remarks}. Please try again."
                    : $"Your payment for Invoice {invoice.InvoiceNo} was rejected. Please try again.";

                var notifRejected = new Notification
                {
                    Id = Guid.NewGuid().ToString(),
                    Type = "alert",
                    Title = "Payment Rejected",
                    Description = rejectionMessage,
                    InvoiceNo = invoice.InvoiceNo,
                    RecipientUserId = submission.ClientId,
                    RecipientRole = "Client",
                    RelatedPaymentId = payment.Id,
                    RelatedInvoiceId = invoice.Id,
                    Read = false,
                    Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                    Source = "Finance Department",
                    CreatedAt = DateTime.UtcNow
                };
                _context.Notifications.Add(notifRejected);
            }
        }
        else if (request.Status == "Returned / Needs Correction")
        {
            if (invoice != null)
            {
                invoice.PaymentValidationStatus = "Returned / Needs Correction";
                _context.Invoices.Update(invoice);

                var history = new PaymentHistory
                {
                    Id = Guid.NewGuid().ToString(),
                    PaymentId = payment.Id,
                    InvoiceId = invoice.Id,
                    Status = "Returned / Needs Correction",
                    Action = "Return Payment",
                    Remarks = request.Remarks ?? "Manual submission returned for correction.",
                    PerformedBy = "Finance Manager",
                    PerformedRole = "Financial Manager",
                    CreatedAt = DateTime.UtcNow
                };
                _context.PaymentHistories.Add(history);

                var returnMessage = !string.IsNullOrWhiteSpace(request.Remarks)
                    ? $"Your payment for Invoice {invoice.InvoiceNo} needs correction: {request.Remarks}."
                    : $"Your payment for Invoice {invoice.InvoiceNo} was returned for correction. Please check the details.";

                var notifReturned = new Notification
                {
                    Id = Guid.NewGuid().ToString(),
                    Type = "info",
                    Title = "Payment Needs Correction",
                    Description = returnMessage,
                    InvoiceNo = invoice.InvoiceNo,
                    RecipientUserId = submission.ClientId,
                    RecipientRole = "Client",
                    RelatedPaymentId = payment.Id,
                    RelatedInvoiceId = invoice.Id,
                    Read = false,
                    Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                    Source = "Finance Department",
                    CreatedAt = DateTime.UtcNow
                };
                _context.Notifications.Add(notifReturned);
            }
        }

        await _context.SaveChangesAsync(default);
        await transaction.CommitAsync();

        return Ok(new
        {
            submission.Id,
            submission.Status,
            message = $"Submission status updated to '{request.Status}'."
        });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            return StatusCode(500, new { message = "An error occurred while updating the status. Transaction rolled back.", details = ex.Message });
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET api/speedpay/notifications?clientId=
    // Returns notifications for a specific client (used by SpeedPay portal)
    // ──────────────────────────────────────────────────────────────────────────
    [HttpGet("/api/speedpay/notifications")]
    public async Task<IActionResult> GetClientNotifications([FromQuery] string clientId)
    {
        if (string.IsNullOrWhiteSpace(clientId))
            return BadRequest(new { message = "clientId is required." });

        var notifications = await _context.Notifications
            .AsNoTracking()
            .Where(n => n.RecipientUserId == clientId && n.RecipientRole == "Client")
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new
            {
                n.Id,
                n.Type,
                n.Title,
                n.Description,
                n.InvoiceNo,
                n.Read,
                n.Date,
                n.Timestamp,
                n.Source,
                n.RelatedPaymentId,
                n.RelatedInvoiceId,
                n.CreatedAt
            })
            .ToListAsync();

        return Ok(notifications);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PUT api/speedpay/notifications/{id}/read
    // Marks a single notification as read
    // ──────────────────────────────────────────────────────────────────────────
    [HttpPut("/api/speedpay/notifications/{id}/read")]
    public async Task<IActionResult> MarkNotificationRead(string id)
    {
        var notif = await _context.Notifications.FirstOrDefaultAsync(n => n.Id == id);
        if (notif == null) return NotFound(new { message = "Notification not found." });

        notif.Read = true;
        _context.Notifications.Update(notif);
        await _context.SaveChangesAsync(default);
        return Ok(new { message = "Notification marked as read.", id = notif.Id });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PUT api/speedpay/notifications/mark-all-read?clientId=
    // Marks all notifications for a client as read
    // ──────────────────────────────────────────────────────────────────────────
    [HttpPut("/api/speedpay/notifications/mark-all-read")]
    public async Task<IActionResult> MarkAllNotificationsRead([FromQuery] string clientId)
    {
        if (string.IsNullOrWhiteSpace(clientId))
            return BadRequest(new { message = "clientId is required." });

        var notifs = await _context.Notifications
            .Where(n => n.RecipientUserId == clientId && n.RecipientRole == "Client" && !n.Read)
            .ToListAsync();

        foreach (var n in notifs) n.Read = true;
        await _context.SaveChangesAsync(default);
        return Ok(new { message = $"{notifs.Count} notifications marked as read." });
    }

    private async Task<string> GenerateNextOrNumberAsync()
    {
        var currentYear = DateTime.UtcNow.Year;
        var yearPrefix = $"OR-{currentYear}-";

        var orNumbers = await _context.Payments
            .AsNoTracking()
            .Where(p => p.OrNumber != null && p.OrNumber.StartsWith(yearPrefix))
            .Select(p => p.OrNumber)
            .ToListAsync();

        var receiptNumbers = await _context.OfficialReceipts
            .AsNoTracking()
            .Where(r => r.ReceiptNumber != null && r.ReceiptNumber.StartsWith(yearPrefix))
            .Select(r => r.ReceiptNumber)
            .ToListAsync();

        int maxSeq = 0;
        foreach (var orNum in orNumbers)
        {
            if (!string.IsNullOrEmpty(orNum) && orNum.Length > yearPrefix.Length)
            {
                var seqPart = orNum.Substring(yearPrefix.Length);
                if (int.TryParse(seqPart, out var seq))
                {
                    if (seq > maxSeq) maxSeq = seq;
                }
            }
        }

        foreach (var rNum in receiptNumbers)
        {
            if (!string.IsNullOrEmpty(rNum) && rNum.Length > yearPrefix.Length)
            {
                var seqPart = rNum.Substring(yearPrefix.Length);
                if (int.TryParse(seqPart, out var seq))
                {
                    if (seq > maxSeq) maxSeq = seq;
                }
            }
        }

        return $"{yearPrefix}{(maxSeq + 1):D4}";
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Request DTOs
    // ──────────────────────────────────────────────────────────────────────────
    public record SubmitRequest(
        string InvoiceId,
        string? InvoiceNumber,
        string? ClientId,
        string? ClientName,
        string? PaymentMethod,
        string? ReferenceNumber,
        decimal AmountPaid,
        string? ProofFileName,
        string? ProofFileUrl
    );

    public class UpdateStatusRequest
    {
        public string? Status { get; set; }
        public string? Remarks { get; set; }
        public string? Notes { get; set; }
    }
}
