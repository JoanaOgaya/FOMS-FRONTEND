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
[Route("api/speedpay")]
[Route("speedpay")]
public class SpeedPaySharedController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;
    private readonly FOMS.Application.Interfaces.IApplicationDbContext _appContext;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly Microsoft.Extensions.Configuration.IConfiguration _configuration;

    public SpeedPaySharedController(
        FomsDbContext fomsDb,
        FOMS.Application.Interfaces.IApplicationDbContext appContext,
        IHttpClientFactory httpClientFactory,
        Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        _fomsDb = fomsDb;
        _appContext = appContext;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
    }

    private string CurrentRole() =>
        User.FindFirst(ClaimTypes.Role)?.Value
        ?? User.FindFirst("role")?.Value
        ?? "Finance";

    [HttpGet("payments/pending-validation")]
    public async Task<IActionResult> GetPendingValidation()
    {
        var payments = await _fomsDb.Payments.AsNoTracking()
            .Where(p => (p.PaymentMethod == "PayMongo" || p.PaymentMethod == "SpeedPay" || p.PaymentMethod == "GCash" || p.PaymentMethod == "Maya")
                     && (p.PaymentStatus == "Pending Finance Validation" || p.PaymentStatus == "Pending Validation" || p.PaymentStatus == "Pending"))
            .ToListAsync();

        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var data = payments.Select(p =>
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
                paymentMethod = p.PaymentMethod ?? "PayMongo",
                speedpayReference = p.ReferenceNumber ?? $"SP-{p.PaymentId}",
                paymongoReference = p.ReferenceNumber ?? $"PM-{p.PaymentId}",
                paymentStatus = "Pending Finance Validation",
                submittedAt = (p.SubmittedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss")
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            count = data.Count,
            data
        });
    }

    [HttpPost("payments/{paymentId}/validate")]
    public async Task<IActionResult> ValidatePayment(int paymentId)
    {
        var payment = await _fomsDb.Payments.FindAsync(paymentId);
        if (payment == null)
            return NotFound(new { success = false, message = "Payment not found." });

        payment.PaymentStatus = "Validated";
        payment.ValidatedAt = DateTime.UtcNow;
        payment.ValidatedBy = 2;

        // Update Invoice
        var invoice = await _fomsDb.Invoices.FindAsync(payment.InvoiceId);
        if (invoice != null)
        {
            invoice.PaidAmount = (invoice.PaidAmount ?? 0m) + payment.Amount;
            invoice.OutstandingBalance = Math.Max(0m, invoice.TotalAmount - (invoice.PaidAmount ?? 0m));
            if (invoice.OutstandingBalance <= 0m)
            {
                invoice.InvoiceStatus = "Paid";
                invoice.ValidationStatus = "Validated";

                // Generate Official Receipt if fully paid
                var orSeq = await _fomsDb.OfficialReceipts.CountAsync() + 1;
                var orNum = $"OR-2026-{orSeq:D4}";
                _fomsDb.OfficialReceipts.Add(new FomsOfficialReceipt
                {
                    OrNumber = orNum,
                    PaymentId = paymentId,
                    InvoiceId = invoice.InvoiceId,
                    ClientId = invoice.ClientId,
                    IssuedAmount = invoice.TotalAmount,
                    IssuedBy = "Head Accountant",
                    IssuedAt = DateTime.UtcNow,
                    Status = "Issued"
                });
            }
            invoice.UpdatedAt = DateTime.UtcNow;
        }

        // Update AR
        var ar = await _fomsDb.AccountsReceivable.FirstOrDefaultAsync(a => a.InvoiceId == payment.InvoiceId);
        if (ar != null)
        {
            ar.PaidAmount = (ar.PaidAmount ?? 0m) + payment.Amount;
            ar.OutstandingBalance = Math.Max(0m, ar.InvoiceAmount - (ar.PaidAmount ?? 0m));
            if (ar.OutstandingBalance <= 0m)
            {
                ar.ArStatus = "Settled";
            }
        }

        // PaymentHistory
        _fomsDb.PaymentHistory.Add(new PaymentHistory
        {
            PaymentId = paymentId,
            InvoiceId = payment.InvoiceId,
            Status = "Validated",
            Action = "VALIDATE_SPEEDPAY",
            Remarks = "SpeedPay transaction validated by finance.",
            PerformedBy = 2,
            PerformedRole = CurrentRole(),
            CreatedAt = DateTime.UtcNow
        });

        // AuditLog
        _fomsDb.AuditLogs.Add(new AuditLog
        {
            user_id = 2,
            role = CurrentRole(),
            action = "VALIDATE_SPEEDPAY",
            module = "SpeedPay Validation",
            affected_record_type = "Payment",
            affected_record_id = paymentId,
            before_value = "Pending Finance Validation",
            after_value = "Validated",
            remarks = $"Validated SpeedPay payment #{paymentId} of ₱{payment.Amount:N2}.",
            created_at = DateTime.UtcNow
        });

        // Notification
        _fomsDb.Notifications.Add(new Notification
        {
            RecipientRole = "Accountant",
            Title = "SpeedPay Payment Validated",
            Message = $"SpeedPay payment #{paymentId} for Invoice #{payment.InvoiceId} has been validated.",
            Type = "Payment_Validated",
            RelatedRecordType = "Payment",
            RelatedRecordId = paymentId,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();
        return Ok(new { success = true, message = "SpeedPay payment validated successfully." });
    }

    [HttpPost("payments/{paymentId}/reject")]
    public async Task<IActionResult> RejectPayment(int paymentId, [FromBody] dynamic? body)
    {
        var payment = await _fomsDb.Payments.FindAsync(paymentId);
        if (payment == null)
            return NotFound(new { success = false, message = "Payment not found." });

        string reason = body?.reason?.ToString() ?? "Payment details do not match bank gateway settlement.";
        payment.PaymentStatus = "Rejected";
        payment.RejectionReason = reason;
        payment.RejectedAt = DateTime.UtcNow;
        payment.RejectedBy = 2;

        _fomsDb.PaymentHistory.Add(new PaymentHistory
        {
            PaymentId = paymentId,
            InvoiceId = payment.InvoiceId,
            Status = "Rejected",
            Action = "REJECT_SPEEDPAY",
            Remarks = reason,
            PerformedBy = 2,
            PerformedRole = CurrentRole(),
            CreatedAt = DateTime.UtcNow
        });

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            user_id = 2,
            role = CurrentRole(),
            action = "REJECT_SPEEDPAY",
            module = "SpeedPay Validation",
            affected_record_type = "Payment",
            affected_record_id = paymentId,
            before_value = "Pending Finance Validation",
            after_value = "Rejected",
            remarks = reason,
            created_at = DateTime.UtcNow
        });

        _fomsDb.Notifications.Add(new Notification
        {
            RecipientRole = "Accountant",
            Title = "SpeedPay Payment Rejected",
            Message = $"SpeedPay payment #{paymentId} rejected: {reason}",
            Type = "Payment_Rejected",
            RelatedRecordType = "Payment",
            RelatedRecordId = paymentId,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();
        return Ok(new { success = true, message = "SpeedPay payment rejected." });
    }

    [HttpPost("payments/{paymentId}/return")]
    public async Task<IActionResult> ReturnPayment(int paymentId, [FromBody] dynamic? body)
    {
        var payment = await _fomsDb.Payments.FindAsync(paymentId);
        if (payment == null)
            return NotFound(new { success = false, message = "Payment not found." });

        string remarks = body?.remarks?.ToString() ?? "SpeedPay transaction returned for correction.";
        payment.PaymentStatus = "Returned";
        payment.Remarks = remarks;

        _fomsDb.PaymentHistory.Add(new PaymentHistory
        {
            PaymentId = paymentId,
            InvoiceId = payment.InvoiceId,
            Status = "Returned",
            Action = "RETURN_SPEEDPAY",
            Remarks = remarks,
            PerformedBy = 2,
            PerformedRole = CurrentRole(),
            CreatedAt = DateTime.UtcNow
        });

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            user_id = 2,
            role = CurrentRole(),
            action = "RETURN_SPEEDPAY",
            module = "SpeedPay Validation",
            affected_record_type = "Payment",
            affected_record_id = paymentId,
            before_value = "Pending Finance Validation",
            after_value = "Returned",
            remarks = remarks,
            created_at = DateTime.UtcNow
        });

        _fomsDb.Notifications.Add(new Notification
        {
            RecipientRole = "Accountant",
            Title = "SpeedPay Payment Returned",
            Message = $"SpeedPay payment #{paymentId} returned for correction: {remarks}",
            Type = "Payment_Returned",
            RelatedRecordType = "Payment",
            RelatedRecordId = paymentId,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();
        return Ok(new { success = true, message = "SpeedPay payment returned for correction." });
    }

    public class InitiateSpeedPayRequest
    {
        public string? InvoiceNo { get; set; }
        public string? InvoiceId { get; set; }
        public decimal Amount { get; set; }
        public string? PaymentMethod { get; set; }
        public string? ReturnUrl { get; set; }
    }

    [AllowAnonymous]
    [HttpPost("create-payment")]
    [HttpPost("initiate-payment")]
    public async Task<IActionResult> InitiateInvoicePayment([FromBody] InitiateSpeedPayRequest req)
    {
        int targetInvoiceId = 0;
        int.TryParse(req.InvoiceId, out targetInvoiceId);
        var invoice = await _fomsDb.Invoices.FirstOrDefaultAsync(i => 
            i.InvoiceNumber == req.InvoiceNo || 
            (targetInvoiceId > 0 && i.InvoiceId == targetInvoiceId));

        var invoiceNum = invoice?.InvoiceNumber ?? req.InvoiceNo ?? "INV-1001";
        var amount = req.Amount > 0 ? req.Amount : (invoice?.TotalAmount ?? 25000m);
        var clientId = invoice?.ClientId ?? 1;

        var secretKey = _configuration["PayMongo:SecretKey"];
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            return StatusCode(503, new { success = false, message = "Payment provider is not configured." });
        }
        var returnUrl = req.ReturnUrl ?? "http://localhost:5174/pay-invoice";
        var successUrl = returnUrl.Contains("?") ? $"{returnUrl}&status=success" : $"{returnUrl}?status=success";
        var cancelUrl = returnUrl.Contains("?") ? $"{returnUrl}&status=cancelled" : $"{returnUrl}?status=cancelled";

        string checkoutUrl;
        string checkoutId = "cs_" + Guid.NewGuid().ToString("N").Substring(0, 12);
        string referenceNo = $"SP-TX-{DateTime.UtcNow.Ticks % 1000000:D6}";

        try
        {
            var client = _httpClientFactory.CreateClient();
            var base64Key = Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes($"{secretKey}:"));
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", base64Key);

            var sessionPayload = new
            {
                data = new
                {
                    attributes = new
                    {
                        send_email_receipt = false,
                        show_description = true,
                        show_line_items = true,
                        description = $"SpeedPay Payment for Invoice {invoiceNum}",
                        line_items = new[]
                        {
                            new
                            {
                                currency = "PHP",
                                amount = (int)(amount * 100),
                                description = $"Payment for Invoice {invoiceNum}",
                                name = $"Invoice {invoiceNum}",
                                quantity = 1
                            }
                        },
                        payment_method_types = new[] { "qrph" },
                        success_url = successUrl,
                        cancel_url = cancelUrl
                    }
                }
            };

            var content = new StringContent(System.Text.Json.JsonSerializer.Serialize(sessionPayload), System.Text.Encoding.UTF8, "application/json");
            var response = await client.PostAsync("https://api.paymongo.com/v1/checkout_sessions", content);

            if (!response.IsSuccessStatusCode)
            {
                return StatusCode(502, new { success = false, message = "Payment provider could not create a checkout session." });
            }

            var json = await response.Content.ReadAsStringAsync();
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var data = doc.RootElement.GetProperty("data");
            checkoutId = data.GetProperty("id").GetString() ?? checkoutId;
            checkoutUrl = data.GetProperty("attributes").GetProperty("checkout_url").GetString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(checkoutUrl))
            {
                return StatusCode(502, new { success = false, message = "Payment provider returned incomplete checkout details." });
            }
        }
        catch (HttpRequestException)
        {
            return StatusCode(503, new { success = false, message = "Payment provider is unavailable." });
        }
        catch (System.Text.Json.JsonException)
        {
            return StatusCode(502, new { success = false, message = "Payment provider returned an invalid response." });
        }

        // Record pending payment in Payments table
        var paymentId = Guid.NewGuid().ToString();
        var clientName = "SpeedPay Client";
        if (invoice != null && invoice.ClientId > 0)
        {
            var cl = await _fomsDb.Clients.FindAsync(invoice.ClientId);
            if (cl != null && !string.IsNullOrEmpty(cl.CompanyName)) clientName = cl.CompanyName;
        }

        var payment = new FOMS.Domain.Entities.Payment
        {
            Id = paymentId,
            OrNumber = $"PENDING-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            InvoiceId = invoiceNum,
            InvoiceNo = invoiceNum,
            ClientId = clientId.ToString(),
            ClientName = clientName,
            Amount = amount,
            PaymentMethod = req.PaymentMethod ?? "PayMongo",
            ReferenceNumber = referenceNo,
            Remarks = "SpeedPay checkout session initiated.",
            PaymentStatus = "Pending Finance Validation",
            SubmittedAt = DateTime.UtcNow,
            PaymentDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            RecordedBy = clientName
        };
        await _appContext.Payments.AddAsync(payment);
        await _appContext.SaveChangesAsync(default);

        return Ok(new
        {
            success = true,
            checkoutUrl,
            checkoutId,
            referenceOrNumber = referenceNo,
            paymentId = payment.Id,
            amount,
            invoiceNo = invoiceNum
        });
    }
}
