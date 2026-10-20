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

[Authorize]
[ApiController]
[Route("api/cash-flow")]
[Route("api/v1/cashflow")]
[Route("api/v1/cash-flow")]
[Route("cash-flow")]
public class CashFlowController : ApiControllerBase
{
    private readonly IRepository<CashFlowTransaction> _repository;
    private readonly IApplicationDbContext _context;
    private readonly FomsDbContext _fomsDb;

    public CashFlowController(IRepository<CashFlowTransaction> repository, IApplicationDbContext context, FomsDbContext fomsDb)
    {
        _repository = repository;
        _context = context;
        _fomsDb = fomsDb;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var inflows = await _fomsDb.CashInflows.AsNoTracking().ToListAsync();
        var outflows = await _fomsDb.CashOutflows.AsNoTracking().ToListAsync();

        var records = new List<object>();
        foreach (var inf in inflows)
        {
            records.Add(new
            {
                id = $"IN-{inf.InflowId}",
                type = "Inflow",
                amount = inf.Amount,
                sourceReference = inf.ReferenceNumber ?? inf.Source ?? $"Inflow {inf.InflowId}",
                date = (inf.TransactionDate ?? inf.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
                recordedBy = "Crystalyn Joyce C. Fajardo",
                category = inf.Source ?? "Collection",
                status = inf.Status ?? "Validated"
            });
        }
        foreach (var outf in outflows)
        {
            records.Add(new
            {
                id = !string.IsNullOrEmpty(outf.CashOutflowId) ? outf.CashOutflowId : $"OUT-{outf.OutflowId}",
                type = "Outflow",
                amount = outf.Amount,
                sourceReference = outf.Description ?? outf.Category ?? outf.CashOutflowId ?? $"Outflow {outf.OutflowId}",
                date = (outf.TransactionDate ?? outf.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
                recordedBy = "Crystalyn Joyce C. Fajardo",
                category = outf.Category ?? "Disbursement",
                status = outf.Status ?? "Approved"
            });
        }

        if (!records.Any())
        {
            var fallback = await _repository.GetAllAsync();
            return Ok(fallback);
        }

        return Ok(records);
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var inflow = await _fomsDb.CashInflows.SumAsync(t => (decimal?)t.Amount) ?? 0m;
        var outflow = await _fomsDb.CashOutflows.SumAsync(t => (decimal?)t.Amount) ?? 0m;

        if (inflow == 0 && outflow == 0)
        {
            inflow = await _context.CashFlowTransactions.Where(t => t.Type == "Inflow").SumAsync(t => (decimal?)t.Amount) ?? 0m;
            outflow = await _context.CashFlowTransactions.Where(t => t.Type == "Outflow").SumAsync(t => (decimal?)t.Amount) ?? 0m;
        }

        return Ok(new { Inflow = inflow, Outflow = outflow });
    }

    [HttpGet("balances")]
    public async Task<IActionResult> GetBalances()
    {
        var balances = await Mediator.Send(new CashFlowFeatures.GetBankBalancesQuery());
        return Ok(balances);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CashFlowTransaction request)
    {
        var addedBy = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
        var command = new CashFlowFeatures.AddCashFlowCommand(
            Type: request.Type,
            Category: request.Category,
            Amount: request.Amount,
            ReferenceNo: request.ReferenceNo,
            Description: request.Description,
            AddedBy: addedBy
        );
        var result = await Mediator.Send(command);
        return CreatedAtAction(nameof(GetAll), new { id = result.Id }, result);
    }
}
