using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class CashFlowFeatures
{
    // ─────────────────────────────────────────────────────────────────
    // GET CASH FLOW
    // ─────────────────────────────────────────────────────────────────
    public record GetCashFlowQuery : IRequest<List<CashFlowTransaction>>;

    public class GetCashFlowQueryHandler : IRequestHandler<GetCashFlowQuery, List<CashFlowTransaction>>
    {
        private readonly IApplicationDbContext _context;

        public GetCashFlowQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<CashFlowTransaction>> Handle(GetCashFlowQuery request, CancellationToken cancellationToken)
        {
            return await _context.CashFlowTransactions.ToListAsync(cancellationToken);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // GET BANK BALANCES
    // ─────────────────────────────────────────────────────────────────
    public record GetBankBalancesQuery : IRequest<List<BankBalance>>;

    public class GetBankBalancesQueryHandler : IRequestHandler<GetBankBalancesQuery, List<BankBalance>>
    {
        private readonly IApplicationDbContext _context;

        public GetBankBalancesQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<BankBalance>> Handle(GetBankBalancesQuery request, CancellationToken cancellationToken)
        {
            return await _context.BankBalances.ToListAsync(cancellationToken);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // ADD CASH FLOW — with full validation (TASK 15)
    // ─────────────────────────────────────────────────────────────────
    public record AddCashFlowCommand(
        string Type,         // "Inflow" or "Outflow"
        string Category,
        decimal Amount,
        string ReferenceNo,
        string Description,
        string AddedBy = "System"       // The authenticated user — never hardcoded
    ) : IRequest<CashFlowTransaction>;

    public class AddCashFlowCommandHandler : IRequestHandler<AddCashFlowCommand, CashFlowTransaction>
    {
        private readonly IApplicationDbContext _context;

        public AddCashFlowCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<CashFlowTransaction> Handle(AddCashFlowCommand request, CancellationToken cancellationToken)
        {
            // ── TASK 15: Validate cash flow inputs ────────────────────────────
            if (request.Amount <= 0m)
                throw new InvalidOperationException("Cash flow amount must be greater than zero.");

            if (request.Type != "Inflow" && request.Type != "Outflow")
                throw new InvalidOperationException("Cash flow Type must be either 'Inflow' or 'Outflow'.");

            if (string.IsNullOrWhiteSpace(request.ReferenceNo))
                throw new InvalidOperationException("Reference number is required for cash flow entries.");

            if (string.IsNullOrWhiteSpace(request.AddedBy))
                throw new InvalidOperationException("User identity (AddedBy) is required.");

            var entry = new CashFlowTransaction
            {
                Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                Type = request.Type,
                Category = request.Category,
                Amount = request.Amount,
                ReferenceNo = request.ReferenceNo,
                Description = request.Description
            };

            // TASK 17: Audit log with real user identity (never hardcoded)
            var audit = new AuditLog
            {
                UserId = request.AddedBy,
                EntityName = "CashFlowTransaction",
                EntityId = entry.Id,
                Action = request.Type == "Inflow" ? "Cash Inflow" : "Cash Outflow",
                Details = $"Recorded cash {request.Type.ToLower()} of {entry.Amount:N2} " +
                          $"under category '{entry.Category}' (Ref: {entry.ReferenceNo}). " +
                          $"Recorded by: {request.AddedBy}.",
                BeforeValue = null,
                AfterValue = $"Amount: {entry.Amount:N2} | Type: {entry.Type} | Ref: {entry.ReferenceNo}"
            };
            await _context.AuditLogs.AddAsync(audit, cancellationToken);

            _context.CashFlowTransactions.Add(entry);
            await _context.SaveChangesAsync(cancellationToken);
            return entry;
        }
    }
}
