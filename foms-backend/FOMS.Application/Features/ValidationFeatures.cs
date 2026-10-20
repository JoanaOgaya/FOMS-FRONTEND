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

public static class ValidationFeatures
{
    public record GetValidationsQuery : IRequest<List<PaymentValidation>>;

    public class GetValidationsQueryHandler : IRequestHandler<GetValidationsQuery, List<PaymentValidation>>
    {
        private readonly IApplicationDbContext _context;

        public GetValidationsQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<PaymentValidation>> Handle(GetValidationsQuery request, CancellationToken cancellationToken)
        {
            return await _context.PaymentValidations.ToListAsync(cancellationToken);
        }
    }

    public record SubmitValidationCommand(
        string InvoiceNo,
        string ClientName,
        string DriverName,
        decimal AmountCollected
    ) : IRequest<PaymentValidation>;

    public class SubmitValidationCommandHandler : IRequestHandler<SubmitValidationCommand, PaymentValidation>
    {
        private readonly IApplicationDbContext _context;

        public SubmitValidationCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<PaymentValidation> Handle(SubmitValidationCommand request, CancellationToken cancellationToken)
        {
            var validation = new PaymentValidation
            {
                InvoiceNo = request.InvoiceNo,
                ClientName = request.ClientName,
                DriverName = request.DriverName,
                AmountCollected = request.AmountCollected,
                Status = "Pending",
                DateSubmitted = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
            };

            _context.PaymentValidations.Add(validation);
            await _context.SaveChangesAsync(cancellationToken);
            return validation;
        }
    }

    public record VerifyValidationCommand(
        string Id,
        string Status
    ) : IRequest<bool>;

    public class VerifyValidationCommandHandler : IRequestHandler<VerifyValidationCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public VerifyValidationCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(VerifyValidationCommand request, CancellationToken cancellationToken)
        {
            var val = await _context.PaymentValidations.FirstOrDefaultAsync(v => v.Id == request.Id, cancellationToken);
            if (val == null) return false;

            val.Status = request.Status;

            if (request.Status.ToLower() == "approved")
            {
                var invoice = await _context.Invoices
                    .FirstOrDefaultAsync(i => i.InvoiceNo == val.InvoiceNo, cancellationToken);
                if (invoice != null)
                {
                    var beforeBalance = invoice.Balance;
                    var beforeStatus = invoice.PaymentStatus;

                    // Validate: cannot over-approve
                    var applied = Math.Min(val.AmountCollected, invoice.Balance);

                    invoice.AmountPaid += applied;
                    BillingComputationService.RecalculateInvoice(invoice);
                    invoice.UpdatedBy = "Delivery Validation System";

                    var orNumber = "OR-DEL-" + DateTime.UtcNow.Ticks.ToString().Substring(10, 6);
                    var payment = new Payment
                    {
                        OrNumber = orNumber,
                        InvoiceId = invoice.Id,
                        InvoiceNo = invoice.InvoiceNo,
                        ClientId = invoice.ClientId,
                        ClientName = invoice.ClientName,
                        PaymentDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                        Amount = applied,
                        PaymentMethod = "Bank Transfer",
                        ReferenceNumber = "DEL-" + DateTime.UtcNow.Ticks.ToString().Substring(12, 6),
                        Remarks = $"Driver {val.DriverName} collection validation approved",
                        RecordedBy = "Delivery Validation System",
                        DateRecorded = DateTime.UtcNow.ToString("yyyy-MM-dd")
                    };
                    _context.Payments.Add(payment);

                    // Official Receipt
                    var paymentCollection = new PaymentCollection
                    {
                        InvoiceId = invoice.Id,
                        CollectedDate = DateTime.UtcNow,
                        AmountCollected = applied,
                        PaymentMethod = "Bank Transfer",
                        Status = "Completed"
                    };
                    _context.PaymentCollections.Add(paymentCollection);

                    var officialReceipt = new OfficialReceipt
                    {
                        PaymentCollectionId = paymentCollection.Id,
                        ReceiptNumber = orNumber,
                        IssuedDate = DateTime.UtcNow
                    };
                    _context.OfficialReceipts.Add(officialReceipt);

                    // Audit with before/after values
                    var audit = new AuditLog
                    {
                        UserId = "Delivery Validation System",
                        EntityName = "PaymentValidation",
                        EntityId = val.Id,
                        Action = "Delivery Validation Approved",
                        Details = $"Driver {val.DriverName} delivery validation approved for invoice {val.InvoiceNo}. Applied: {applied:N2}.",
                        BeforeValue = $"Balance: {beforeBalance:N2} | Status: {beforeStatus}",
                        AfterValue = $"Balance: {invoice.Balance:N2} | Status: {invoice.PaymentStatus}"
                    };
                    await _context.AuditLogs.AddAsync(audit, cancellationToken);

                    await _context.SaveChangesAsync(cancellationToken);

                    // Sync Billing Invoice and ReceivableBalance
                    await BillingComputationService.SyncBillingInvoiceAndReceivableAsync(invoice, _context, cancellationToken);

                    // Sync client balance authoritatively
                    await BillingComputationService.SyncClientBalanceAsync(invoice.ClientId, _context, cancellationToken);
                }
            }

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}
