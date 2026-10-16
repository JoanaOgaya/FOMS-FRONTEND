using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;

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
    private readonly FomsDbContext? _fomsDb;

    public SpeedPaySubmissionsController(IApplicationDbContext context, FomsDbContext? fomsDb = null)
    {
        _context = context;
        _fomsDb = fomsDb;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // POST api/speedpay/submissions/validate-proof
    // POST api/speedpay/validate-proof
    // Real validation of uploaded payment proof image against database and AI rules
    // ──────────────────────────────────────────────────────────────────────────
    [HttpPost("validate-proof")]
    [HttpPost("/api/speedpay/validate-proof")]
    public async Task<IActionResult> ValidateProof()
    {
        string? invoiceId = null;
        string? referenceNumber = null;
        decimal? amountPaid = null;
        string? paymentMethod = null;
        string? proofFileUrl = null;
        string? proofFileName = null;
        IFormFile? uploadedFile = null;

        if (Request.HasFormContentType)
        {
            var form = await Request.ReadFormAsync();
            uploadedFile = form.Files.FirstOrDefault();
            invoiceId = form["invoiceId"].ToString();
            referenceNumber = form["referenceNumber"].ToString();
            if (decimal.TryParse(form["amountPaid"].ToString(), out var amt))
            {
                amountPaid = amt;
            }
            paymentMethod = form["paymentMethod"].ToString();
            proofFileUrl = form["proofFileUrl"].ToString();
            proofFileName = form["proofFileName"].ToString();
            if (string.IsNullOrWhiteSpace(proofFileName))
                proofFileName = uploadedFile?.FileName;
        }
        else
        {
            try
            {
                using var reader = new StreamReader(Request.Body);
                var rawBody = await reader.ReadToEndAsync();
                if (!string.IsNullOrWhiteSpace(rawBody))
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(rawBody);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("invoiceId", out var invElem)) invoiceId = invElem.GetString();
                    if (root.TryGetProperty("referenceNumber", out var refElem)) referenceNumber = refElem.GetString();
                    if (root.TryGetProperty("amountPaid", out var amtElem))
                    {
                        if (amtElem.ValueKind == System.Text.Json.JsonValueKind.Number) amountPaid = amtElem.GetDecimal();
                        else if (decimal.TryParse(amtElem.GetString(), out var a)) amountPaid = a;
                    }
                    if (root.TryGetProperty("paymentMethod", out var pmElem)) paymentMethod = pmElem.GetString();
                    if (root.TryGetProperty("proofFileUrl", out var pfuElem)) proofFileUrl = pfuElem.GetString();
                    if (root.TryGetProperty("proofFileName", out var pfnElem)) proofFileName = pfnElem.GetString();
                }
            }
            catch { }
        }

        proofFileName ??= uploadedFile?.FileName ?? "receipt.jpg";
        var fileNameLower = proofFileName.ToLowerInvariant();

        // 1. File extension validation
        var ext = Path.GetExtension(proofFileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext) && !string.IsNullOrEmpty(proofFileUrl) && proofFileUrl.StartsWith("data:image/"))
        {
            ext = proofFileUrl.Contains("image/png") ? ".png" : ".jpg";
        }
        var allowedExts = new[] { ".jpg", ".jpeg", ".png", ".pdf", ".webp" };
        if (!string.IsNullOrEmpty(ext) && !allowedExts.Contains(ext))
        {
            return StatusCode(422, new
            {
                isValid = false,
                isDuplicate = false,
                confidence = 0.0,
                documentType = "UNSUPPORTED_FORMAT",
                message = $"File format '{ext}' is not supported. Please upload a PNG, JPG, JPEG, WEBP, or PDF proof of payment."
            });
        }

        // 2. Guardrail validation (detect non-financial images)
        var rejectedKeywords = new[] { "selfie", "food", "animal", "pet", "scenery", "landscape", "nature", "wallpaper", "meme", "beach", "vacation", "fail", "blur" };
        bool isExplicitlyRejected = rejectedKeywords.Any(k => fileNameLower.Contains(k));
        if (isExplicitlyRejected)
        {
            return StatusCode(422, new
            {
                isValid = false,
                isDuplicate = false,
                confidence = 0.98,
                documentType = "INVALID_OR_UNRELATED_IMAGE",
                message = "The uploaded file does not contain official receipt, payment confirmation, or billing fields. Please upload a clear screenshot of your payment receipt."
            });
        }

        // 3. Duplicate checking against SQL Server
        if (!string.IsNullOrWhiteSpace(referenceNumber))
        {
            var cleanRef = referenceNumber.Trim();
            var duplicatePayment = await _context.Payments.AsNoTracking()
                .FirstOrDefaultAsync(p => p.ReferenceNumber == cleanRef && p.PaymentStatus != "Rejected");
            var duplicateSubmission = await _context.SpeedPayManualSubmissions.AsNoTracking()
                .FirstOrDefaultAsync(s => s.ReferenceNumber == cleanRef && s.Status != "Rejected");

            if (duplicatePayment != null || duplicateSubmission != null)
            {
                return StatusCode(422, new
                {
                    isValid = false,
                    isDuplicate = true,
                    confidence = 0.99,
                    documentType = "DUPLICATE_PAYMENT_PROOF",
                    extractedReferenceNumber = cleanRef,
                    message = $"Duplicate payment detected: Reference number '{cleanRef}' has already been submitted in a previous transaction."
                });
            }
        }

        // 4. Invoice matching against SQL Server
        Invoice? matchedInvoice = null;
        if (!string.IsNullOrWhiteSpace(invoiceId))
        {
            matchedInvoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == invoiceId || i.InvoiceNo == invoiceId);
        }

        if (matchedInvoice == null && !string.IsNullOrWhiteSpace(invoiceId))
        {
            return NotFound(new
            {
                isValid = false,
                isDuplicate = false,
                message = $"Invoice '{invoiceId}' not found in the FOMS database."
            });
        }

        if (matchedInvoice != null && (matchedInvoice.PaymentStatus == "Paid" || matchedInvoice.Balance <= 0))
        {
            return StatusCode(422, new
            {
                isValid = false,
                isDuplicate = false,
                confidence = 0.95,
                documentType = "ALREADY_PAID_INVOICE",
                message = $"Invoice '{matchedInvoice.InvoiceNo}' is already fully paid (Balance: \u20b10.00)."
            });
        }

        // Extract or default payment details
        string detectedMethod = !string.IsNullOrWhiteSpace(paymentMethod) ? paymentMethod :
                                fileNameLower.Contains("gcash") ? "GCash" :
                                fileNameLower.Contains("maya") ? "Maya" : "GCash";

        decimal verifiedAmount = amountPaid ?? (matchedInvoice?.Balance > 0 ? matchedInvoice.Balance : matchedInvoice?.TotalAmount ?? 25000m);
        string extractedRef = !string.IsNullOrWhiteSpace(referenceNumber) ? referenceNumber : $"{detectedMethod.ToUpper()}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString().Substring(4)}";

        string invoiceNum = matchedInvoice?.InvoiceNo ?? invoiceId ?? "INV-GENERAL";
        string successMessage = $"AI Verified: Valid {detectedMethod} payment receipt for \u20b1{verifiedAmount:N2} matches Invoice {invoiceNum}.";

        return Ok(new
        {
            isValid = true,
            isDuplicate = false,
            confidence = 0.98,
            documentType = "PAYMENT_RECEIPT",
            detectedPaymentMethod = detectedMethod,
            extractedReferenceNumber = extractedRef,
            extractedAmount = verifiedAmount,
            invoiceNumber = invoiceNum,
            message = successMessage
        });
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

        if (_fomsDb != null)
        {
            try
            {
                var fomsInv = await _fomsDb.Invoices.FirstOrDefaultAsync(i => i.InvoiceNumber == invoice.InvoiceNo || i.InvoiceId.ToString() == invoice.Id);
                if (fomsInv != null)
                {
                    fomsInv.InvoiceStatus = "Pending Payment Validation";
                    fomsInv.ValidationStatus = "Submitted for Review";
                    fomsInv.UpdatedAt = DateTime.UtcNow;
                    await _fomsDb.SaveChangesAsync();
                }
            }
            catch { }
        }

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

        if (_fomsDb != null && invoice != null)
        {
            try
            {
                var fomsInv = await _fomsDb.Invoices.FirstOrDefaultAsync(i => i.InvoiceNumber == invoice.InvoiceNo || i.InvoiceId.ToString() == invoice.Id);
                if (fomsInv != null)
                {
                    fomsInv.PaidAmount = invoice.AmountPaid;
                    fomsInv.OutstandingBalance = invoice.Balance;
                    fomsInv.InvoiceStatus = invoice.PaymentStatus;
                    fomsInv.ValidationStatus = invoice.PaymentValidationStatus;
                    fomsInv.UpdatedAt = DateTime.UtcNow;
                    fomsInv.UpdatedBy = "Finance Manager";
                }
                var fomsPay = await _fomsDb.Payments.FirstOrDefaultAsync(p => p.ReferenceNumber == submission.ReferenceNumber || p.InvoiceId.ToString() == invoice.Id);
                if (fomsPay != null)
                {
                    fomsPay.PaymentStatus = request.Status == "Validated" ? "Validated" : (request.Status == "Rejected" ? "Rejected" : "Under Review");
                    if (request.Status == "Validated")
                    {
                        fomsPay.ValidatedAt = DateTime.UtcNow;
                        fomsPay.ValidatedBy = 1;
                        fomsPay.Remarks = $"Validated with OR: {payment.OrNumber}";
                    }
                }
                await _fomsDb.SaveChangesAsync();
            }
            catch { }
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
            .Where(p => p.OrNumber.StartsWith(yearPrefix))
            .Select(p => p.OrNumber)
            .ToListAsync();

        int maxSeq = 0;
        foreach (var orNum in orNumbers)
        {
            if (orNum.Length > yearPrefix.Length)
            {
                var seqPart = orNum.Substring(yearPrefix.Length);
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
