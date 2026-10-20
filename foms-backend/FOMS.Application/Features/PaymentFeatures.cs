using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class PaymentFeatures
{
    // ─────────────────────────────────────────────────────────────────
    // GET PAYMENTS
    // ─────────────────────────────────────────────────────────────────
    public record GetPaymentsQuery : IRequest<List<Payment>>;

    public class GetPaymentsQueryHandler : IRequestHandler<GetPaymentsQuery, List<Payment>>
    {
        private readonly IApplicationDbContext _context;

        public GetPaymentsQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<Payment>> Handle(GetPaymentsQuery request, CancellationToken cancellationToken)
        {
            return await _context.Payments.ToListAsync(cancellationToken);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // RECORD PAYMENT — with full validation guards (TASK 3, 4, 10)
    // ─────────────────────────────────────────────────────────────────
    public record RecordPaymentCommand(
        string OrNumber,
        string InvoiceId,
        string InvoiceNo,
        string ClientId,
        string ClientName,
        string PaymentDate,
        decimal Amount,
        string PaymentMethod,
        string ReferenceNumber,
        string? ProofImageUrl,
        string? Remarks,
        string RecordedBy
    ) : IRequest<Payment>;

    public class RecordPaymentCommandHandler : IRequestHandler<RecordPaymentCommand, Payment>
    {
        private readonly IApplicationDbContext _context;

        public RecordPaymentCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Payment> Handle(RecordPaymentCommand request, CancellationToken cancellationToken)
        {
            // Guard — Reference Number is required
            if (string.IsNullOrWhiteSpace(request.ReferenceNumber))
                throw new InvalidOperationException("Reference Number is required.");

            // ── TASK 3: Guard — Zero / Negative Payment ──────────────────────
            if (request.Amount <= 0m)
                throw new InvalidOperationException("Payment amount must be greater than zero.");

            // ── TASK 3: Guard — Duplicate Reference Number per Invoice ────────
            var refExists = await _context.Payments
                .AnyAsync(p => p.ReferenceNumber == request.ReferenceNumber
                               && p.InvoiceId == request.InvoiceId,
                          cancellationToken);
            if (refExists)
                throw new InvalidOperationException(
                    $"Reference number '{request.ReferenceNumber}' has already been used for this invoice.");

            // ── Fetch Invoice ─────────────────────────────────────────────────
            var invoice = await _context.Invoices
                .FirstOrDefaultAsync(i => i.Id == request.InvoiceId, cancellationToken);
            if (invoice == null)
                throw new InvalidOperationException($"Invoice '{request.InvoiceId}' not found.");

            // ── Guard — Ensure invoice is not already Paid ────────────────────
            if (invoice.PaymentStatus == "Paid" && invoice.Balance <= 0m)
                throw new InvalidOperationException($"Invoice '{invoice.InvoiceNo}' has already been fully paid.");

            // ── Guard — Amount must not exceed outstanding balance ─────────────
            if (request.Amount > invoice.Balance)
                throw new InvalidOperationException(
                    $"Payment amount ({request.Amount:N2}) exceeds the outstanding balance ({invoice.Balance:N2}). Overpayments are not allowed.");

            // ── Record the payment ────────────────────────────────────────────
            var beforeBalance = invoice.Balance;
            var beforeStatus = invoice.PaymentStatus;

            // Generate a temporary OR number placeholder (real OR is generated on validation)
            var tempOrNum = $"PENDING-{Guid.NewGuid().ToString("N").Substring(0, 8).ToUpper()}";

            // Check if an OR number was explicitly provided; if not, use placeholder
            var orNum = string.IsNullOrWhiteSpace(request.OrNumber) ? tempOrNum : request.OrNumber;

            // Guard — Duplicate OR Number (only if not using placeholder)
            if (!orNum.StartsWith("PENDING-"))
            {
                var orExists = await _context.Payments
                    .AnyAsync(p => p.OrNumber == orNum, cancellationToken);
                if (orExists)
                    throw new InvalidOperationException(
                        $"Official Receipt number '{orNum}' already exists. Each payment must have a unique OR number.");
            }

            var payment = new Payment
            {
                OrNumber = orNum,
                InvoiceId = request.InvoiceId,
                InvoiceNo = request.InvoiceNo,
                ClientId = request.ClientId,
                ClientName = request.ClientName,
                PaymentDate = request.PaymentDate,
                Amount = request.Amount,
                PaymentMethod = request.PaymentMethod,
                ReferenceNumber = request.ReferenceNumber,
                ProofImageUrl = request.ProofImageUrl,
                Remarks = request.Remarks,
                RecordedBy = request.RecordedBy,
                DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                PaymentStatus = "Pending Validation",
                SubmittedAt = DateTime.UtcNow
            };

            // ── TASK 17: Audit Log with Before/After values ────────────────────
            var audit = new AuditLog
            {
                UserId = request.RecordedBy,
                EntityName = "Payment",
                EntityId = payment.Id,
                Action = "Record Payment",
                Details = $"Recorded payment of {request.Amount:N2} for invoice {request.InvoiceNo}. " +
                          $"Method: {request.PaymentMethod}. Ref: {request.ReferenceNumber}. " +
                          $"Status: Pending Validation.",
                BeforeValue = $"Balance: {beforeBalance:N2} | Status: {beforeStatus}",
                AfterValue = $"Balance: {invoice.Balance:N2} | Status: Pending Validation"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            _context.Payments.Add(payment);

            // Notify Finance Manager/Head Accountant about new payment
            var notifFm = new Notification
            {
                Id = Guid.NewGuid().ToString(),
                Type = "PAYMENT_VALIDATION_REQUIRED",
                Title = "New Payment Recorded",
                Description = $"A payment of {request.Amount:N2} for Invoice {request.InvoiceNo} has been recorded and is pending validation.",
                InvoiceNo = request.InvoiceNo,
                RecipientRole = "Financial Manager",
                RelatedPaymentId = payment.Id,
                RelatedInvoiceId = request.InvoiceId,
                Read = false,
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                Source = "Accountant"
            };
            _context.Notifications.Add(notifFm);

            var notifHa = new Notification
            {
                Id = Guid.NewGuid().ToString(),
                Type = "PAYMENT_VALIDATION_REQUIRED",
                Title = "New Payment Recorded",
                Description = $"A payment of {request.Amount:N2} for Invoice {request.InvoiceNo} has been recorded and is pending validation.",
                InvoiceNo = request.InvoiceNo,
                RecipientRole = "Head Accountant",
                RelatedPaymentId = payment.Id,
                RelatedInvoiceId = request.InvoiceId,
                Read = false,
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                Source = "Accountant"
            };
            _context.Notifications.Add(notifHa);

            await _context.SaveChangesAsync(cancellationToken);

            return payment;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // DELETE PAYMENT — revert invoice and sync balance
    // ─────────────────────────────────────────────────────────────────
    public record DeletePaymentCommand(string Id, string User, string Role) : IRequest<bool>;

    public class DeletePaymentCommandHandler : IRequestHandler<DeletePaymentCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public DeletePaymentCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(DeletePaymentCommand request, CancellationToken cancellationToken)
        {
            var payment = await _context.Payments
                .FirstOrDefaultAsync(p => p.Id == request.Id, cancellationToken);
            if (payment == null) return false;

            // Revert Invoice
            var invoice = await _context.Invoices
                .FirstOrDefaultAsync(i => i.Id == payment.InvoiceId, cancellationToken);
            if (invoice != null)
            {
                var beforeBalance = invoice.Balance;
                var beforeStatus = invoice.PaymentStatus;

                invoice.AmountPaid = Math.Max(0m, invoice.AmountPaid - payment.Amount);
                BillingComputationService.RecalculateInvoice(invoice);
                invoice.UpdatedBy = $"{request.User} ({request.Role})";

                var audit = new AuditLog
                {
                    UserId = $"{request.User} ({request.Role})",
                    EntityName = "Payment",
                    EntityId = payment.Id,
                    Action = "Delete Payment",
                    Details = $"Deleted payment of {payment.Amount:N2} for invoice {payment.InvoiceNo} (OR: {payment.OrNumber}).",
                    BeforeValue = $"Balance: {beforeBalance:N2} | Status: {beforeStatus}",
                    AfterValue = $"Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}"
                };
                await _context.AuditLogs.AddAsync(audit, cancellationToken);
            }

            // Remove associated PaymentCollection and OfficialReceipt
            var collection = await _context.PaymentCollections
                .FirstOrDefaultAsync(c => c.InvoiceId == payment.InvoiceId
                                          && c.AmountCollected == payment.Amount,
                                     cancellationToken);
            if (collection != null)
            {
                var receipt = await _context.OfficialReceipts
                    .FirstOrDefaultAsync(r => r.PaymentCollectionId == collection.Id, cancellationToken);
                if (receipt != null) _context.OfficialReceipts.Remove(receipt);
                _context.PaymentCollections.Remove(collection);
            }

            _context.Payments.Remove(payment);
            await _context.SaveChangesAsync(cancellationToken);

            // TASK 12: Sync client balance after reversal
            if (invoice != null)
            {
                // Sync Billing Invoice and ReceivableBalance
                await BillingComputationService.SyncBillingInvoiceAndReceivableAsync(invoice, _context, cancellationToken);

                await BillingComputationService.SyncClientBalanceAsync(payment.ClientId, _context, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);
            }

            return true;
        }
    }
}
