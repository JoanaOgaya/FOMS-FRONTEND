using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api")]
[ApiController]
public class AccountingController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public AccountingController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("chart-of-accounts")]
    public async Task<IActionResult> GetChartOfAccounts()
    {
        return Ok(await _context.ChartOfAccounts.ToListAsync());
    }

    [HttpGet("general-ledger")]
    public async Task<IActionResult> GetGeneralLedger()
    {
        return Ok(await _context.GeneralLedgerEntries.ToListAsync());
    }

    [Authorize]
    [HttpPost("journal-entries")]
    public async Task<IActionResult> CreateJournalEntry([FromBody] JournalEntry request)
    {
        await _context.JournalEntries.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetGeneralLedger), new { id = request.Id }, request);
    }

    [HttpGet("trial-balance")]
    public async Task<IActionResult> GetTrialBalance()
    {
        return Ok(await _context.TrialBalances.ToListAsync());
    }
}
