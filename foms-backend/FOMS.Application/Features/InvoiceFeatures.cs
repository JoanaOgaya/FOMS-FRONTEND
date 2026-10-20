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

public static class InvoiceFeatures
{
    // ─────────────────────────────────────────────────────────────────
    // GET INVOICES — with dynamic aging refresh
    // ─────────────────────────────────────────────────────────────────
    public record GetInvoicesQuery : IRequest<List<Invoice>>;

    public class GetInvoicesQueryHandler : IRequestHandler<GetInvoicesQuery, List<Invoice>>
    {
        private readonly IApplicationDbContext _context;

        public GetInvoicesQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<Invoice>> Handle(GetInvoicesQuery request, CancellationToken cancellationToken)
        {
            var invoices = await _context.Invoices.ToListAsync(cancellationToken);

            // TASK 6 & 7: Dynamically refresh aging, days-overdue, and status
            // on every retrieval so stale DB values are never served.
            foreach (var invoice in invoices)
            {
                BillingComputationService.RefreshInvoiceAging(invoice);
            }

            return invoices;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // CREATE INVOICE — uses BillingComputationService
    // ─────────────────────────────────────────────────────────────────
    public record CreateInvoiceCommand(
        string InvoiceNo,
        string ClientId,
        string ClientName,
        string BillingDate,
        string DueDate,
        decimal FreightCharges,
        decimal OtherCharges,
        string Description,
        string EncodedBy
    ) : IRequest<Invoice>;

    public class CreateInvoiceCommandHandler : IRequestHandler<CreateInvoiceCommand, Invoice>
    {
        private readonly IApplicationDbContext _context;

        public CreateInvoiceCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Invoice> Handle(CreateInvoiceCommand request, CancellationToken cancellationToken)
        {
            var invoice = new Invoice
            {
                InvoiceNo = request.InvoiceNo,
                ClientId = request.ClientId,
                ClientName = request.ClientName,
                BillingDate = request.BillingDate,
                DueDate = request.DueDate,
                FreightCharges = request.FreightCharges,
                OtherCharges = request.OtherCharges,
                AmountPaid = 0m,
                Description = request.Description,
                EncodedBy = request.EncodedBy,
                DateEncoded = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                UpdatedBy = request.EncodedBy,
                Archived = false
            };

            BillingComputationService.RecalculateInvoice(invoice);

            _context.Invoices.Add(invoice);

            var audit = new AuditLog
            {
                UserId = request.EncodedBy,
                EntityName = "Invoice",
                EntityId = invoice.Id,
                Action = "Create Invoice",
                Details = $"Created invoice {invoice.InvoiceNo} for {invoice.ClientName}. " +
                          $"Subtotal: {invoice.Subtotal:N2}, VAT (12%): {invoice.VatAmount:N2}, Surcharge: {invoice.Surcharge:N2}, Total: {invoice.TotalAmount:N2}.",
                BeforeValue = null,
                AfterValue = $"Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            await _context.SaveChangesAsync(cancellationToken);

            // Synchronize Billing Invoice and ReceivableBalance
            await BillingComputationService.SyncBillingInvoiceAndReceivableAsync(invoice, _context, cancellationToken);

            // TASK 12: Sync client balance from sum of invoices
            await BillingComputationService.SyncClientBalanceAsync(request.ClientId, _context, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);

            return invoice;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // UPDATE INVOICE — uses BillingComputationService
    // ─────────────────────────────────────────────────────────────────
    public record UpdateInvoiceCommand(
        string Id,
        string BillingDate,
        string DueDate,
        decimal FreightCharges,
        decimal OtherCharges,
        string Description,
        string UpdatedBy
    ) : IRequest<Invoice?>;

    public class UpdateInvoiceCommandHandler : IRequestHandler<UpdateInvoiceCommand, Invoice?>
    {
        private readonly IApplicationDbContext _context;

        public UpdateInvoiceCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Invoice?> Handle(UpdateInvoiceCommand request, CancellationToken cancellationToken)
        {
            var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == request.Id, cancellationToken);
            if (invoice == null) return null;

            var beforeBalance = invoice.Balance;
            var beforeStatus = invoice.PaymentStatus;

            invoice.BillingDate = request.BillingDate;
            invoice.DueDate = request.DueDate;
            invoice.FreightCharges = request.FreightCharges;
            invoice.OtherCharges = request.OtherCharges;
            invoice.Description = request.Description;
            invoice.UpdatedBy = request.UpdatedBy;

            // TASK 2: Recalculate all financial fields via BillingComputationService
            BillingComputationService.RecalculateInvoice(invoice);
            invoice.UpdatedBy = request.UpdatedBy;

            var audit = new AuditLog
            {
                UserId = request.UpdatedBy,
                EntityName = "Invoice",
                EntityId = invoice.Id,
                Action = "Update Invoice",
                Details = $"Updated invoice {invoice.InvoiceNo}. New Total: {invoice.TotalAmount:N2}, VAT: {invoice.VatAmount:N2}.",
                BeforeValue = $"Balance: {beforeBalance:N2} | Status: {beforeStatus}",
                AfterValue = $"Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            await _context.SaveChangesAsync(cancellationToken);

            // Synchronize Billing Invoice and ReceivableBalance
            await BillingComputationService.SyncBillingInvoiceAndReceivableAsync(invoice, _context, cancellationToken);

            // TASK 12: Sync client balance
            await BillingComputationService.SyncClientBalanceAsync(invoice.ClientId, _context, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);

            return invoice;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // DELETE INVOICE
    // ─────────────────────────────────────────────────────────────────
    public record DeleteInvoiceCommand(string Id, string DeletedBy, string UserRole) : IRequest<bool>;

    public class DeleteInvoiceCommandHandler : IRequestHandler<DeleteInvoiceCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public DeleteInvoiceCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(DeleteInvoiceCommand request, CancellationToken cancellationToken)
        {
            var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == request.Id, cancellationToken);
            if (invoice == null) return false;

            var clientId = invoice.ClientId;

            var audit = new AuditLog
            {
                UserId = $"{request.DeletedBy} ({request.UserRole})",
                EntityName = "Invoice",
                EntityId = invoice.Id,
                Action = "Delete Invoice",
                Details = $"Deleted invoice {invoice.InvoiceNo} for {invoice.ClientName}.",
                BeforeValue = $"Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}",
                AfterValue = "Deleted"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            // Remove standard Billing Invoice and ReceivableBalance too
            string billingInvoiceNo;
            var parts = invoice.InvoiceNo.Split('-');
            if (parts.Length >= 3)
            {
                billingInvoiceNo = $"BI-{parts[1]}-{parts[2]}";
            }
            else
            {
                billingInvoiceNo = invoice.InvoiceNo;
            }

            if (invoice.InvoiceNo != billingInvoiceNo)
            {
                var billingInvoice = await _context.Invoices.FirstOrDefaultAsync(i => i.InvoiceNo == billingInvoiceNo, cancellationToken);
                if (billingInvoice != null) _context.Invoices.Remove(billingInvoice);
            }

            var receivable = await _context.ReceivableBalances.FirstOrDefaultAsync(r => r.InvoiceId == billingInvoiceNo, cancellationToken);
            if (receivable != null) _context.ReceivableBalances.Remove(receivable);

            _context.Invoices.Remove(invoice);
            await _context.SaveChangesAsync(cancellationToken);

            // TASK 12: Sync client balance after deletion
            await BillingComputationService.SyncClientBalanceAsync(clientId, _context, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);

            return true;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // ARCHIVE INVOICE
    // ─────────────────────────────────────────────────────────────────
    public record ArchiveInvoiceCommand(string Id, bool Archived, string User, string Role) : IRequest<bool>;

    public class ArchiveInvoiceCommandHandler : IRequestHandler<ArchiveInvoiceCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public ArchiveInvoiceCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(ArchiveInvoiceCommand request, CancellationToken cancellationToken)
        {
            var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == request.Id, cancellationToken);
            if (invoice == null) return false;

            invoice.Archived = request.Archived;
            var audit = new AuditLog
            {
                UserId = $"{request.User} ({request.Role})",
                EntityName = "Invoice",
                EntityId = invoice.Id,
                Action = request.Archived ? "Archive Invoice" : "Unarchive Invoice",
                Details = $"{(request.Archived ? "Archived" : "Unarchived")} invoice {invoice.InvoiceNo}.",
                BeforeValue = $"Archived: {!request.Archived}",
                AfterValue = $"Archived: {request.Archived}"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            await _context.SaveChangesAsync(cancellationToken);

            // Synchronize Billing Invoice and ReceivableBalance
            await BillingComputationService.SyncBillingInvoiceAndReceivableAsync(invoice, _context, cancellationToken);

            // Re-sync client balance since archiving excludes the invoice from balance calc
            await BillingComputationService.SyncClientBalanceAsync(invoice.ClientId, _context, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);

            return true;
        }
    }
}
