using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Features;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

public class PaymentDto
{
    public string? Id { get; set; }
    public string? InvoiceId { get; set; }
    public string? InvoiceNumber { get; set; }
    public string? InvoiceNo { get; set; }
    public string? ClientId { get; set; }
    public string? ClientName { get; set; }
    public decimal? Amount { get; set; }
    public string? PaymentMethod { get; set; }
    public string? ReferenceNumber { get; set; }
    public bool? BankConfirmed { get; set; }
    public string? ProofOfPaymentUrl { get; set; }
    public string? ProofImageUrl { get; set; }
    public string? RecordedBy { get; set; }
    public string? RecordedAt { get; set; }
    public string? DateRecorded { get; set; }
    public string? PaymentDate { get; set; }
    public string? ValidatedBy { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public string? Status { get; set; }
    public string? PaymentStatus { get; set; }
    public string? Notes { get; set; }
    public string? Remarks { get; set; }
    public string? OrNumber { get; set; }
    public string? Flow { get; set; }
}

[Route("payments")]
[Route("api/payments")]
[Route("api/v1/payments")]
public class PaymentsController : ApiControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly FomsDbContext _fomsDb;

    public PaymentsController(IApplicationDbContext context, FomsDbContext fomsDb)
    {
        _context = context;
        _fomsDb = fomsDb;
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _context.Payments.AnyAsync(p => p.Flow == "outflow"))
            {
                var outflowPayment = new Payment
                {
                    Id = "DISB-001",
                    InvoiceId = "INV-002",
                    InvoiceNo = "BI-2026-0001",
                    ClientId = "CA-001",
                    ClientName = "Lazada Philippines",
                    Amount = 15000m,
                    Flow = "outflow",
                    PaymentMethod = "Bank Transfer",
                    ReferenceNumber = "DISB-2026-0042",
                    PaymentStatus = "Validated",
                    RecordedBy = "Crystalyn Joyce C. Fajardo",
                    SubmittedAt = DateTime.UtcNow.AddDays(-1)
                };
                _context.Payments.Add(outflowPayment);
                await _context.SaveChangesAsync(default);
            }
        }
        catch { }
    }

    private static object MapPayment(Payment p)
    {
        var status = !string.IsNullOrEmpty(p.PaymentStatus) ? p.PaymentStatus : "Pending Validation";
        var isConfirmed = status.Equals("Validated", StringComparison.OrdinalIgnoreCase) || status.Equals("Approved", StringComparison.OrdinalIgnoreCase);

        var recDate = !string.IsNullOrWhiteSpace(p.PaymentDate) ? p.PaymentDate :
                      !string.IsNullOrWhiteSpace(p.DateRecorded) ? p.DateRecorded :
                      p.SubmittedAt.ToString("yyyy-MM-dd");

        return new
        {
            id = p.Id,
            invoiceId = p.InvoiceId,
            invoiceNumber = !string.IsNullOrEmpty(p.InvoiceNo) ? p.InvoiceNo : p.InvoiceId,
            invoiceNo = p.InvoiceNo,
            clientId = p.ClientId,
            clientName = p.ClientName,
            amount = p.Amount,
            flow = !string.IsNullOrEmpty(p.Flow) ? p.Flow : "inflow",
            paymentMethod = p.PaymentMethod,
            referenceNumber = p.ReferenceNumber,
            bankConfirmed = isConfirmed,
            proofOfPaymentUrl = p.ProofImageUrl,
            proofImageUrl = p.ProofImageUrl,
            recordedBy = p.RecordedBy,
            recordedAt = recDate,
            dateRecorded = recDate,
            paymentDate = recDate,
            validatedBy = p.ValidatedBy,
            validatedAt = p.ValidatedAt?.ToString("yyyy-MM-ddTHH:mm:ss"),
            status = status,
            paymentStatus = status,
            notes = p.Remarks,
            remarks = p.Remarks,
            orNumber = p.OrNumber
        };
    }

    [HttpGet]
    public async Task<IActionResult> GetPayments()
    {
        await EnsureSeededAsync();
        var payments = await _context.Payments
            .OrderByDescending(p => p.SubmittedAt)
            .ToListAsync();

        var mapped = payments.Select(MapPayment).ToList();
        return Ok(mapped);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var p = await _context.Payments.FirstOrDefaultAsync(x => x.Id == id || x.ReferenceNumber == id);
        if (p == null) return NotFound(new { message = $"Payment {id} not found." });

        return Ok(MapPayment(p));
    }

    [HttpPost]
    public async Task<IActionResult> RecordPayment([FromBody] PaymentDto dto)
    {
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? dto.RecordedBy ?? "User";

        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == dto.InvoiceId || i.InvoiceNo == dto.InvoiceNumber || i.InvoiceNo == dto.InvoiceId);
        var invId = invoice?.Id ?? dto.InvoiceId ?? Guid.NewGuid().ToString();
        var invNo = invoice?.InvoiceNo ?? dto.InvoiceNumber ?? dto.InvoiceNo ?? $"INV-{DateTime.UtcNow:yyyyMMdd}";
        var clientId = invoice?.ClientId ?? dto.ClientId ?? "1";
        var clientName = invoice?.ClientName ?? dto.ClientName ?? "Client";

        var payment = new Payment
        {
            Id = Guid.NewGuid().ToString(),
            OrNumber = dto.OrNumber ?? $"OR-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..4].ToUpper()}",
            InvoiceId = invId,
            InvoiceNo = invNo,
            ClientId = clientId,
            ClientName = clientName,
            PaymentDate = dto.PaymentDate ?? dto.DateRecorded ?? DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Amount = dto.Amount ?? 0m,
            Flow = dto.Flow ?? "inflow",
            PaymentMethod = dto.PaymentMethod ?? "Bank Transfer",
            ReferenceNumber = dto.ReferenceNumber ?? Guid.NewGuid().ToString("N")[..8].ToUpper(),
            ProofImageUrl = dto.ProofOfPaymentUrl ?? dto.ProofImageUrl,
            Remarks = dto.Notes ?? dto.Remarks ?? "Payment recorded",
            RecordedBy = user,
            DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            PaymentStatus = dto.Status ?? dto.PaymentStatus ?? "Pending Finance Validation",
            SubmittedAt = DateTime.UtcNow
        };

        _context.Payments.Add(payment);

        if (invoice != null && (payment.PaymentStatus == "Validated" || payment.PaymentStatus == "Approved"))
        {
            invoice.AmountPaid += payment.Amount;
            invoice.Balance = Math.Max(0, invoice.TotalAmount - invoice.AmountPaid);
            if (invoice.Balance <= 0)
            {
                invoice.PaymentStatus = "Paid";
                invoice.PaymentValidationStatus = "Paid";
            }
        }

        _context.AuditLogs.Add(new AuditLog
        {
            UserId = user,
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = "Record Payment",
            Details = $"Recorded payment of ₱{payment.Amount:N2} for invoice {payment.InvoiceNo}. Ref: {payment.ReferenceNumber}.",
            LoggedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync(default);

        // Sync with MSSQL FomsDbContext
        try
        {
            _fomsDb.Payments.Add(new FOMS.Domain.Entities.SqlServer.Payment
            {
                InvoiceId = int.TryParse(invoice?.Id, out var parsedInvId) ? parsedInvId : 1,
                ClientId = int.TryParse(clientId, out var parsedCId) ? parsedCId : 1,
                Amount = payment.Amount,
                PaymentMethod = payment.PaymentMethod,
                ReferenceNumber = payment.ReferenceNumber,
                PaymentStatus = payment.PaymentStatus,
                SubmittedAt = DateTime.UtcNow
            });
            await _fomsDb.SaveChangesAsync();
        }
        catch
        {
        }

        return Ok(MapPayment(payment));
    }

    [Authorize]
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdatePayment(string id, [FromBody] PaymentDto dto)
    {
        var payment = await _context.Payments.FirstOrDefaultAsync(p => p.Id == id);
        if (payment == null) return NotFound(new { message = $"Payment {id} not found." });

        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "User";

        var newStatus = dto.Status ?? dto.PaymentStatus;
        if (!string.IsNullOrEmpty(newStatus))
        {
            payment.PaymentStatus = newStatus;
            if (newStatus.Equals("Validated", StringComparison.OrdinalIgnoreCase) || newStatus.Equals("Approved", StringComparison.OrdinalIgnoreCase))
            {
                payment.ValidatedBy = user;
                payment.ValidatedAt = DateTime.UtcNow;

                var inv = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == payment.InvoiceId || i.InvoiceNo == payment.InvoiceNo);
                if (inv != null)
                {
                    inv.AmountPaid += payment.Amount;
                    inv.Balance = Math.Max(0, inv.TotalAmount - inv.AmountPaid);
                    if (inv.Balance <= 0)
                    {
                        inv.PaymentStatus = "Paid";
                        inv.PaymentValidationStatus = "Paid";
                    }
                }
            }
        }

        if (!string.IsNullOrEmpty(dto.ReferenceNumber))
            payment.ReferenceNumber = dto.ReferenceNumber;

        if (!string.IsNullOrEmpty(dto.Notes) || !string.IsNullOrEmpty(dto.Remarks))
            payment.Remarks = dto.Notes ?? dto.Remarks;

        _context.AuditLogs.Add(new AuditLog
        {
            UserId = user,
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = "Update Payment",
            Details = $"Updated payment {payment.ReferenceNumber}. Status: {payment.PaymentStatus}.",
            LoggedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync(default);

        return Ok(MapPayment(payment));
    }

    [Authorize]
    [HttpPost("{id}/{actionName}")]
    public async Task<IActionResult> ActionOnPayment(string id, string actionName, [FromBody] PaymentDto? dto)
    {
        var payment = await _context.Payments.FirstOrDefaultAsync(p => p.Id == id);
        if (payment == null) return NotFound(new { message = $"Payment {id} not found." });

        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "User";

        var newStatus = actionName.ToLower() switch
        {
            "approve" or "verify" or "validate" => "Validated",
            "reject" => "Rejected",
            _ => payment.PaymentStatus
        };

        payment.PaymentStatus = newStatus;
        payment.ValidatedBy = user;
        payment.ValidatedAt = DateTime.UtcNow;

        if (actionName.Equals("reject", StringComparison.OrdinalIgnoreCase))
        {
            payment.RejectedAt = DateTime.UtcNow;
            payment.RejectedBy = user;
            payment.RejectionReason = dto?.Remarks ?? dto?.Notes ?? "Payment rejected by reviewer.";
        }

        var inv = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == payment.InvoiceId || i.InvoiceNo == payment.InvoiceNo);
        if (inv != null && newStatus == "Validated")
        {
            inv.AmountPaid += payment.Amount;
            inv.Balance = Math.Max(0, inv.TotalAmount - inv.AmountPaid);
            if (inv.Balance <= 0)
            {
                inv.PaymentStatus = "Paid";
                inv.PaymentValidationStatus = "Paid";
            }
        }

        _context.AuditLogs.Add(new AuditLog
        {
            UserId = user,
            EntityName = "Payment",
            EntityId = payment.Id,
            Action = $"Payment {actionName}",
            Details = $"Payment {payment.ReferenceNumber} action {actionName} -> {newStatus}.",
            LoggedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync(default);

        return Ok(MapPayment(payment));
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePayment(string id)
    {
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "Unknown Role";
        var result = await Mediator.Send(new PaymentFeatures.DeletePaymentCommand(id, user, role));
        if (!result) return NotFound();
        return Ok(new { success = true });
    }
}
