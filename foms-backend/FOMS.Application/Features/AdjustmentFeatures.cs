using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class AdjustmentFeatures
{
    // ─────────────────────────────────────────────────────────────────
    // GET ADJUSTMENTS — newest first
    // ─────────────────────────────────────────────────────────────────
    public record GetAdjustmentsQuery : IRequest<List<PaymentAdjustment>>;

    public class GetAdjustmentsQueryHandler : IRequestHandler<GetAdjustmentsQuery, List<PaymentAdjustment>>
    {
        private readonly IApplicationDbContext _context;

        public GetAdjustmentsQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<PaymentAdjustment>> Handle(GetAdjustmentsQuery request, CancellationToken cancellationToken)
        {
            if (!await _context.PaymentAdjustments.AnyAsync(cancellationToken))
            {
                var samples = new List<PaymentAdjustment>
                {
                    new()
                    {
                        Id = "ADJ-001",
                        InvoiceNo = "LZD-2026-0001",
                        AdjustmentType = "Credit",
                        Amount = 2500m,
                        Reason = "Volume tier discount correction for Q3 shipments",
                        AdjustedBy = "Bookkeeper",
                        ApprovedBy = "Crystalyn Joyce C. Fajardo",
                        DateRequested = DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd"),
                        Status = "Pending"
                    },
                    new()
                    {
                        Id = "ADJ-002",
                        InvoiceNo = "BI-2026-0001",
                        AdjustmentType = "Debit",
                        Amount = 1200m,
                        Reason = "Special delivery surcharge addition",
                        AdjustedBy = "Bookkeeper",
                        ApprovedBy = "Crystalyn Joyce C. Fajardo",
                        DateRequested = DateTime.UtcNow.AddDays(-3).ToString("yyyy-MM-dd"),
                        DateApproved = DateTime.UtcNow.AddDays(-2).ToString("yyyy-MM-dd"),
                        Status = "Approved"
                    }
                };
                _context.PaymentAdjustments.AddRange(samples);
                await _context.SaveChangesAsync(cancellationToken);
            }

            // Clean up any legacy GUID records into clean ADJ-00x records
            var guidRecords = await _context.PaymentAdjustments
                .Where(a => a.Id.Length > 15 && a.Id.Contains("-"))
                .ToListAsync(cancellationToken);

            if (guidRecords.Count > 0)
            {
                int nextNum = 3;
                foreach (var g in guidRecords)
                {
                    var cleanId = $"ADJ-{nextNum:D3}";
                    while (await _context.PaymentAdjustments.AnyAsync(x => x.Id == cleanId, cancellationToken))
                    {
                        nextNum++;
                        cleanId = $"ADJ-{nextNum:D3}";
                    }

                    _context.PaymentAdjustments.Remove(g);
                    _context.PaymentAdjustments.Add(new PaymentAdjustment
                    {
                        Id = cleanId,
                        InvoiceNo = g.InvoiceNo,
                        AdjustmentType = g.AdjustmentType,
                        Amount = g.Amount,
                        Reason = g.Reason,
                        AdjustedBy = g.AdjustedBy,
                        ApprovedBy = g.ApprovedBy,
                        DateRequested = g.DateRequested,
                        DateApproved = g.DateApproved,
                        Status = g.Status
                    });
                    nextNum++;
                }
                await _context.SaveChangesAsync(cancellationToken);
            }

            // Return newest first so the list is always up-to-date on screen
            return await _context.PaymentAdjustments
                .OrderByDescending(a => a.DateRequested)
                .ThenByDescending(a => a.Id)
                .ToListAsync(cancellationToken);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // CREATE ADJUSTMENT REQUEST — stays Pending until Accountant approves
    // ─────────────────────────────────────────────────────────────────
    public record CreateAdjustmentCommand(
        string InvoiceNo,
        string AdjustmentType,   // "Credit" | "Debit" | "Write-Off" | "Credit Memo" | "Adjustment"
        decimal Amount,
        string Reason,
        string AdjustedBy = "",  // Submitter
        string ApprovedBy = ""   // Approver (if pre-assigned)
    ) : IRequest<PaymentAdjustment?>;

    public class CreateAdjustmentCommandHandler : IRequestHandler<CreateAdjustmentCommand, PaymentAdjustment?>
    {
        private readonly IApplicationDbContext _context;

        public CreateAdjustmentCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<PaymentAdjustment?> Handle(CreateAdjustmentCommand request, CancellationToken cancellationToken)
        {
            // Guard: amount must be positive
            if (request.Amount <= 0m)
                throw new InvalidOperationException("Adjustment amount must be greater than zero.");

            // Normalize and validate adjustment type
            var rawType = (request.AdjustmentType ?? "Credit").Trim();
            var normalizedType = rawType.Equals("Credit Memo", StringComparison.OrdinalIgnoreCase) ? "Credit" :
                                 rawType.Equals("Adjustment", StringComparison.OrdinalIgnoreCase) ? "Debit" :
                                 rawType;

            var validTypes = new[] { "Credit", "Debit", "Write-Off" };
            if (!validTypes.Contains(normalizedType, StringComparer.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Invalid adjustment type '{request.AdjustmentType}'. Allowed types: Credit, Debit, Write-Off.");

            // Find the invoice (match by InvoiceNo or Id)
            var invoice = await _context.Invoices
                .FirstOrDefaultAsync(i => i.InvoiceNo == request.InvoiceNo || i.Id == request.InvoiceNo, cancellationToken);
            if (invoice == null)
                return null;

            // Guard: Credit / Write-Off cannot exceed the current invoice balance / total amount
            var adjTypeLower = normalizedType.ToLower();
            var maxAllowable = invoice.Balance > 0 ? invoice.Balance : (invoice.TotalAmount > 0 ? invoice.TotalAmount : 0);
            if ((adjTypeLower == "credit" || adjTypeLower == "write-off") && maxAllowable > 0 && request.Amount > maxAllowable)
                throw new InvalidOperationException(
                    $"Adjustment amount (₱{request.Amount:N2}) cannot exceed the invoice amount (₱{maxAllowable:N2}).");

            // Generate clean sequential ID: ADJ-001, ADJ-002, ADJ-003...
            var count = await _context.PaymentAdjustments.CountAsync(cancellationToken);
            var nextId = $"ADJ-{(count + 1):D3}";
            while (await _context.PaymentAdjustments.AnyAsync(a => a.Id == nextId, cancellationToken))
            {
                count++;
                nextId = $"ADJ-{(count + 1):D3}";
            }

            var adjustment = new PaymentAdjustment
            {
                Id           = nextId,
                InvoiceNo    = invoice.InvoiceNo,
                AdjustmentType = normalizedType,
                Amount       = request.Amount,
                Reason       = request.Reason,
                AdjustedBy   = request.AdjustedBy,
                ApprovedBy   = string.Empty,   // Not yet approved — populated on Approve
                DateRequested = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                DateApproved = string.Empty,   // Not yet approved
                Status       = "Pending"
            };

            var audit = new AuditLog
            {
                UserId     = request.AdjustedBy,
                EntityName = "PaymentAdjustment",
                EntityId   = adjustment.Id,
                Action     = "Create Payment Adjustment Request",
                Details    = $"Created pending {request.AdjustmentType} adjustment of {request.Amount:N2} " +
                             $"for invoice {request.InvoiceNo}. Reason: {request.Reason}.",
                BeforeValue = $"Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}",
                AfterValue  = "Status: Pending — awaiting Accountant approval"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            _context.PaymentAdjustments.Add(adjustment);
            await _context.SaveChangesAsync(cancellationToken);

            return adjustment;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // APPROVE ADJUSTMENT — applies balance change and syncs downstream
    // ─────────────────────────────────────────────────────────────────
    public record ApproveAdjustmentCommand(
        string Id,
        string ApprovedBy
    ) : IRequest<PaymentAdjustment?>;

    public class ApproveAdjustmentCommandHandler : IRequestHandler<ApproveAdjustmentCommand, PaymentAdjustment?>
    {
        private readonly IApplicationDbContext _context;

        public ApproveAdjustmentCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<PaymentAdjustment?> Handle(ApproveAdjustmentCommand request, CancellationToken cancellationToken)
        {
            var adjustment = await _context.PaymentAdjustments
                .FirstOrDefaultAsync(a => a.Id == request.Id, cancellationToken);

            if (adjustment == null || adjustment.Status != "Pending")
                return null;

            var invoice = await _context.Invoices
                .FirstOrDefaultAsync(i => i.InvoiceNo == adjustment.InvoiceNo, cancellationToken);
            if (invoice == null)
                return null;

            var beforeBalance = invoice.Balance;
            var beforeStatus  = invoice.PaymentStatus;
            var beforeTotal   = invoice.TotalAmount;

            // Mark adjustment as approved
            adjustment.Status       = "Approved";
            adjustment.ApprovedBy   = request.ApprovedBy;
            adjustment.DateApproved = DateTime.UtcNow.ToString("yyyy-MM-dd");

            var adjType = adjustment.AdjustmentType.ToLower();

            // ── Apply the adjustment to the invoice ──────────────────────────────
            if (adjType == "credit" || adjType == "write-off")
            {
                // Credit / Write-Off: reduces the outstanding balance by
                // increasing AmountPaid (capped at TotalAmount to avoid negatives)
                var applied = Math.Min(adjustment.Amount, invoice.Balance);
                invoice.AmountPaid = Math.Min(invoice.AmountPaid + applied, invoice.TotalAmount);
            }
            else if (adjType == "debit")
            {
                // Debit: increases the outstanding balance by adding to TotalAmount
                // (i.e. additional charges added to the invoice)
                invoice.TotalAmount += adjustment.Amount;
            }

            // Fully recalculate all derived fields using the authoritative service
            BillingComputationService.RecalculateInvoice(invoice);
            invoice.UpdatedBy   = request.ApprovedBy;
            invoice.LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd");

            var audit = new AuditLog
            {
                UserId     = request.ApprovedBy,
                EntityName = "PaymentAdjustment",
                EntityId   = adjustment.Id,
                Action     = "Approve Payment Adjustment",
                Details    = $"Approved {adjustment.AdjustmentType} adjustment of {adjustment.Amount:N2} " +
                             $"for invoice {adjustment.InvoiceNo}. Reason: {adjustment.Reason}.",
                BeforeValue = $"Total: {beforeTotal:N2} | Balance: {beforeBalance:N2} | Status: {beforeStatus}",
                AfterValue  = $"Total: {invoice.TotalAmount:N2} | Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            await _context.SaveChangesAsync(cancellationToken);

            // Sync the Billing Invoice mirror and ReceivableBalance
            await BillingComputationService.SyncBillingInvoiceAndReceivableAsync(invoice, _context, cancellationToken);

            // Sync the client's outstanding balance
            await BillingComputationService.SyncClientBalanceAsync(invoice.ClientId, _context, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);

            return adjustment;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // REJECT ADJUSTMENT — marks as rejected; NO balance change
    // ─────────────────────────────────────────────────────────────────
    public record RejectAdjustmentCommand(
        string Id,
        string RejectedBy
    ) : IRequest<PaymentAdjustment?>;

    public class RejectAdjustmentCommandHandler : IRequestHandler<RejectAdjustmentCommand, PaymentAdjustment?>
    {
        private readonly IApplicationDbContext _context;

        public RejectAdjustmentCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<PaymentAdjustment?> Handle(RejectAdjustmentCommand request, CancellationToken cancellationToken)
        {
            var adjustment = await _context.PaymentAdjustments
                .FirstOrDefaultAsync(a => a.Id == request.Id, cancellationToken);

            if (adjustment == null || adjustment.Status != "Pending")
                return null;

            adjustment.Status       = "Rejected";
            adjustment.ApprovedBy   = request.RejectedBy; // Records who rejected it
            adjustment.DateApproved = DateTime.UtcNow.ToString("yyyy-MM-dd");

            var audit = new AuditLog
            {
                UserId     = request.RejectedBy,
                EntityName = "PaymentAdjustment",
                EntityId   = adjustment.Id,
                Action     = "Reject Payment Adjustment",
                Details    = $"Rejected {adjustment.AdjustmentType} adjustment of {adjustment.Amount:N2} " +
                             $"for invoice {adjustment.InvoiceNo}. Reason: {adjustment.Reason}.",
                BeforeValue = "Status: Pending",
                AfterValue  = $"Status: Rejected by {request.RejectedBy}"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            await _context.SaveChangesAsync(cancellationToken);
            return adjustment;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // DELETE ADJUSTMENT — only if still Pending (Bookkeeper or Accountant)
    // ─────────────────────────────────────────────────────────────────
    public record DeleteAdjustmentCommand(string Id, string DeletedBy) : IRequest<bool>;

    public class DeleteAdjustmentCommandHandler : IRequestHandler<DeleteAdjustmentCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public DeleteAdjustmentCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(DeleteAdjustmentCommand request, CancellationToken cancellationToken)
        {
            var adjustment = await _context.PaymentAdjustments
                .FirstOrDefaultAsync(a => a.Id == request.Id, cancellationToken);

            // Only Pending adjustments can be deleted
            if (adjustment == null || adjustment.Status != "Pending")
                return false;

            var audit = new AuditLog
            {
                UserId     = request.DeletedBy,
                EntityName = "PaymentAdjustment",
                EntityId   = adjustment.Id,
                Action     = "Delete Payment Adjustment",
                Details    = $"Deleted pending {adjustment.AdjustmentType} adjustment of {adjustment.Amount:N2} " +
                             $"for invoice {adjustment.InvoiceNo}.",
                BeforeValue = "Status: Pending",
                AfterValue  = "Deleted"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            _context.PaymentAdjustments.Remove(adjustment);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}
