using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[ApiController]
[Route("api/cash-advances")]
[Route("api/v1/cash-advances")]
[Route("cash-advances")]
public class CashAdvancesController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;
    private readonly ILogger<CashAdvancesController> _logger;

    public CashAdvancesController(FomsDbContext fomsDb, ILogger<CashAdvancesController> logger)
    {
        _fomsDb = fomsDb;
        _logger = logger;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        var query = _fomsDb.CashAdvances.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(a => a.Status == status);
        }

        var list = await query.OrderByDescending(a => a.CreatedAt).ToListAsync();
        return Ok(new
        {
            items = list,
            total = list.Count
        });
    }

    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetById(string id)
    {
        var item = await _fomsDb.CashAdvances.AsNoTracking().FirstOrDefaultAsync(a => a.AdvanceId == id);
        if (item == null) return NotFound(new { message = $"Cash Advance '{id}' not found." });
        return Ok(item);
    }

    /// <summary>
    /// FR-050: Finance Review and Approval of Cash Advance prior to payout.
    /// </summary>
    [HttpPost("{id}/approve")]
    [AllowAnonymous]
    public async Task<IActionResult> Approve(string id, [FromBody] System.Text.Json.JsonElement? body)
    {
        var item = await _fomsDb.CashAdvances.FirstOrDefaultAsync(a => a.AdvanceId == id);
        if (item == null) return NotFound(new { message = $"Cash Advance '{id}' not found." });

        string reviewer = "Financial Manager";
        if (body.HasValue && body.Value.TryGetProperty("approvedBy", out var apprProp) && !string.IsNullOrWhiteSpace(apprProp.GetString()))
        {
            reviewer = apprProp.GetString()!;
        }
        else if (User.Identity?.Name != null)
        {
            reviewer = User.Identity.Name;
        }

        item.Status = "Approved";
        item.ApprovedBy = reviewer;
        item.ApprovedAt = DateTime.UtcNow;

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            role = "Finance",
            action = "CASH_ADVANCE_APPROVED",
            module = "Cash Advances",
            remarks = $"Cash Advance {item.AdvanceId} for {item.CourierName} approved for disbursement: ₱{item.AmountGiven:N2} by {reviewer} per FR-050.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            isSuccess = true,
            message = $"Cash Advance {item.AdvanceId} approved per FR-050.",
            data = item
        });
    }

    /// <summary>
    /// FR-043, FR-044: Payout and Disbursement of approved Cash Advance.
    /// Records Cash Outflow in FOMS_DB.
    /// </summary>
    [HttpPost("{id}/disburse")]
    [AllowAnonymous]
    public async Task<IActionResult> Disburse(string id, [FromBody] System.Text.Json.JsonElement? body)
    {
        var item = await _fomsDb.CashAdvances.FirstOrDefaultAsync(a => a.AdvanceId == id);
        if (item == null) return NotFound(new { message = $"Cash Advance '{id}' not found." });

        string disburser = "Finance Disbursing Officer";
        if (body.HasValue && body.Value.TryGetProperty("disbursedBy", out var disbProp) && !string.IsNullOrWhiteSpace(disbProp.GetString()))
        {
            disburser = disbProp.GetString()!;
        }

        item.Status = "Disbursed";
        item.DisbursedBy = disburser;
        item.DisbursedAt = DateTime.UtcNow;

        // FR-043, FR-044: Record Cash Outflow
        var outflow = new CashOutflow
        {
            SourceReference = item.AdvanceId,
            RecordedBy = disburser,
            Category = "Delivery Cash Advance Payout",
            Description = $"Cash Advance {item.AdvanceId} payout for courier {item.CourierName} (Trip: {item.TripReference})",
            Amount = item.AmountGiven,
            Status = "Completed",
            OutflowDate = DateTime.UtcNow,
            TransactionDate = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };
        _fomsDb.CashOutflows.Add(outflow);

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            role = "Finance",
            action = "CASH_ADVANCE_DISBURSED",
            module = "Cash Advances",
            remarks = $"Cash Advance {item.AdvanceId} disbursed: ₱{item.AmountGiven:N2} to {item.CourierName}. Cash Outflow recorded per FR-043, FR-044.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            isSuccess = true,
            message = $"Cash Advance {item.AdvanceId} disbursed. Cash outflow of ₱{item.AmountGiven:N2} recorded.",
            data = item
        });
    }
}
