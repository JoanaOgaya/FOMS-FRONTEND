using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

public class LiquidationDto
{
    public string? Id { get; set; }
    public string? ReferenceNumber { get; set; }
    public string? SubmittedByName { get; set; }
    public string? SubmittedBy { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? Amount { get; set; }
    public decimal? LeftoverCash { get; set; }
    public decimal? ReimbursementAmount { get; set; }
    public string? Status { get; set; }
    public string? Purpose { get; set; }
    public string? Notes { get; set; }
}

[Authorize]
[ApiController]
[Route("api/liquidations")]
[Route("api/v1/liquidations")]
[Route("liquidations")]
public class LiquidationsController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public LiquidationsController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _fomsDb.Liquidations.AnyAsync())
            {
                var samples = new List<Liquidation>
                {
                    new() { ReferenceNumber = "LIQ-2026-0001", SubmittedByName = "Juan Dela Cruz", TotalAmount = 4500m, LeftoverCash = 500m, ReimbursementAmount = 0m, Status = "Pending Validation", DateSubmitted = DateTime.UtcNow.AddDays(-1), CreatedAt = DateTime.UtcNow.AddDays(-1) },
                    new() { ReferenceNumber = "LIQ-2026-0002", SubmittedByName = "Pedro Santos", TotalAmount = 3200m, LeftoverCash = 0m, ReimbursementAmount = 200m, Status = "Pending Validation", DateSubmitted = DateTime.UtcNow.AddDays(-2), CreatedAt = DateTime.UtcNow.AddDays(-2) },
                    new() { ReferenceNumber = "LIQ-2026-0003", SubmittedByName = "Carlos Reyes", TotalAmount = 6100m, LeftoverCash = 900m, ReimbursementAmount = 0m, Status = "Validated", DateSubmitted = DateTime.UtcNow.AddDays(-4), CreatedAt = DateTime.UtcNow.AddDays(-4) },
                    new() { ReferenceNumber = "LIQ-2026-0004", SubmittedByName = "Miguel Gomez", TotalAmount = 1850m, LeftoverCash = 0m, ReimbursementAmount = 150m, Status = "Returned", DateSubmitted = DateTime.UtcNow.AddDays(-5), CreatedAt = DateTime.UtcNow.AddDays(-5) }
                };
                _fomsDb.Liquidations.AddRange(samples);
                await _fomsDb.SaveChangesAsync();
            }
            else if (!await _fomsDb.Liquidations.AnyAsync(l => l.Status == "Returned"))
            {
                _fomsDb.Liquidations.Add(new Liquidation
                {
                    ReferenceNumber = "LIQ-2026-0004",
                    SubmittedByName = "Miguel Gomez",
                    TotalAmount = 1850m,
                    LeftoverCash = 0m,
                    ReimbursementAmount = 150m,
                    Status = "Returned",
                    DateSubmitted = DateTime.UtcNow.AddDays(-5),
                    CreatedAt = DateTime.UtcNow.AddDays(-5)
                });
                await _fomsDb.SaveChangesAsync();
            }
        }
        catch { }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var query = _fomsDb.Liquidations.AsNoTracking().Where(l => l.IsDeleted != true && l.Status != "Deleted");
        var total = await query.CountAsync();
        var liquidations = await query
            .OrderByDescending(l => l.DateSubmitted ?? l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var liqIds = liquidations.Select(l => l.LiquidationId).ToList();
        var lineItems = await _fomsDb.LiquidationLineItems.AsNoTracking()
            .Where(li => liqIds.Contains(li.LiquidationId))
            .ToListAsync();
        var docs = await _fomsDb.LiquidationDocuments.AsNoTracking()
            .Where(d => liqIds.Contains(d.LiquidationId))
            .ToListAsync();

        var items = liquidations.Select(l => new
        {
            id = l.LiquidationId.ToString(),
            liquidationId = l.LiquidationId,
            reference = l.ReferenceNumber ?? $"LIQ-{l.LiquidationId:D4}",
            referenceNumber = l.ReferenceNumber ?? $"LIQ-{l.LiquidationId:D4}",
            submittedBy = l.SubmittedByName ?? $"Employee {l.SubmittedBy}",
            submittedByName = l.SubmittedByName ?? $"Employee {l.SubmittedBy}",
            submittedAt = (l.DateSubmitted ?? l.CreatedAt ?? DateTime.UtcNow).ToString("o"),
            dateSubmitted = (l.DateSubmitted ?? l.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
            amount = l.TotalAmount,
            totalAmount = l.TotalAmount,
            status = l.Status ?? "Pending Validation",
            leftoverCash = l.LeftoverCash ?? 0m,
            reimbursementAmount = l.ReimbursementAmount ?? 0m,
            expenses = lineItems.Where(li => li.LiquidationId == l.LiquidationId).Select(li => new
            {
                id = li.LineItemId.ToString(),
                type = "Expense",
                description = li.Description,
                amount = li.Amount
            }).ToList(),
            documents = docs.Where(d => d.LiquidationId == l.LiquidationId).Select(d => new
            {
                name = Path.GetFileName(d.FilePath ?? "receipt.pdf"),
                url = d.FilePath ?? "#",
                size = "1.2 MB"
            }).ToList()
        }).ToList();

        return Ok(new
        {
            items,
            total,
            page,
            pageSize
        });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var item = await _fomsDb.Liquidations.AsNoTracking().FirstOrDefaultAsync(l => l.LiquidationId == id && l.IsDeleted != true);
        if (item == null) return NotFound(new { message = "Liquidation not found" });

        var lineItems = await _fomsDb.LiquidationLineItems.Where(li => li.LiquidationId == id).AsNoTracking().ToListAsync();
        var docs = await _fomsDb.LiquidationDocuments.Where(d => d.LiquidationId == id).AsNoTracking().ToListAsync();

        return Ok(new
        {
            id = item.LiquidationId.ToString(),
            item.LiquidationId,
            reference = item.ReferenceNumber ?? $"LIQ-{item.LiquidationId:D4}",
            referenceNumber = item.ReferenceNumber ?? $"LIQ-{item.LiquidationId:D4}",
            submittedBy = item.SubmittedByName ?? $"Employee {item.SubmittedBy}",
            submittedByName = item.SubmittedByName ?? $"Employee {item.SubmittedBy}",
            amount = item.TotalAmount,
            totalAmount = item.TotalAmount,
            leftoverCash = item.LeftoverCash ?? 0m,
            reimbursementAmount = item.ReimbursementAmount ?? 0m,
            status = item.Status ?? "Pending Validation",
            dateSubmitted = (item.DateSubmitted ?? item.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
            lineItems,
            expenses = lineItems.Select(li => new
            {
                id = li.LineItemId.ToString(),
                type = "Expense",
                description = li.Description,
                amount = li.Amount
            }).ToList(),
            documents = docs.Select(d => new
            {
                name = Path.GetFileName(d.FilePath ?? "receipt.pdf"),
                url = d.FilePath ?? "#",
                size = "1.2 MB"
            }).ToList()
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] LiquidationDto dto)
    {
        var item = new Liquidation
        {
            ReferenceNumber = dto.ReferenceNumber ?? $"LIQ-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..4].ToUpper()}",
            SubmittedByName = dto.SubmittedByName ?? dto.SubmittedBy ?? "Employee",
            TotalAmount = dto.TotalAmount ?? dto.Amount ?? 0m,
            LeftoverCash = dto.LeftoverCash ?? 0m,
            ReimbursementAmount = dto.ReimbursementAmount ?? 0m,
            Status = dto.Status ?? "Pending Validation",
            CreatedAt = DateTime.UtcNow,
            DateSubmitted = DateTime.UtcNow,
            IsDeleted = false
        };

        _fomsDb.Liquidations.Add(item);
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "CREATE_LIQUIDATION",
            module = "Liquidations",
            role = "Assistant of Financial Manager",
            affected_record_id = item.LiquidationId,
            remarks = $"Submitted liquidation {item.ReferenceNumber} for {item.SubmittedByName}: ₱{item.TotalAmount:N2}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = item.LiquidationId }, item);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] LiquidationDto dto)
    {
        var item = await _fomsDb.Liquidations.FirstOrDefaultAsync(l => l.LiquidationId == id && l.IsDeleted != true);
        if (item == null) return NotFound(new { message = "Liquidation not found" });

        if (!string.IsNullOrEmpty(dto.Status))
            item.Status = dto.Status;

        if (dto.TotalAmount.HasValue || dto.Amount.HasValue)
            item.TotalAmount = dto.TotalAmount ?? dto.Amount!.Value;

        if (dto.LeftoverCash.HasValue)
            item.LeftoverCash = dto.LeftoverCash.Value;

        if (dto.ReimbursementAmount.HasValue)
            item.ReimbursementAmount = dto.ReimbursementAmount.Value;

        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "UPDATE_LIQUIDATION",
            module = "Liquidations",
            role = "Assistant of Financial Manager",
            affected_record_id = item.LiquidationId,
            remarks = $"Updated liquidation {item.ReferenceNumber} -> status: {item.Status}. Remarks: {dto.Notes ?? "Updated"}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return Ok(item);
    }

    [HttpPost("{id}/{actionName}")]
    [AllowAnonymous]
    public async Task<IActionResult> Act(int id, string actionName, [FromBody] LiquidationDto? dto)
    {
        var item = await _fomsDb.Liquidations.FirstOrDefaultAsync(l => l.LiquidationId == id && l.IsDeleted != true);
        if (item == null) return NotFound(new { message = "Liquidation not found" });

        item.Status = actionName.ToLowerInvariant() switch
        {
            "approve" or "validate" => "Validated",
            "endorse" => "Endorsed",
            "reject" => "Rejected",
            "return" => "Returned",
            "for_correction" or "for-correction" => "Returned",
            "submit" => "Pending Validation",
            _ => item.Status
        };
        item.ValidatedAt = DateTime.UtcNow;
        item.ValidatedBy = 4;

        if (item.Status == "Validated")
        {
            // Post Cash Inflow if leftover cash is returned
            if ((item.LeftoverCash ?? 0) > 0)
            {
                _fomsDb.CashInflows.Add(new CashInflow
                {
                    Amount = item.LeftoverCash!.Value,
                    Source = $"Liquidation {item.ReferenceNumber} Cash Return",
                    ReferenceNumber = item.ReferenceNumber,
                    Status = "Completed",
                    TransactionDate = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                });
            }

            // Post Cash Outflow if courier is due reimbursement
            if ((item.ReimbursementAmount ?? 0) > 0)
            {
                _fomsDb.CashOutflows.Add(new CashOutflow
                {
                    SourceReference = item.ReferenceNumber,
                    RecordedBy = "Finance Liquidation Audit",
                    Category = "Courier Expense Reimbursement",
                    Description = $"Liquidation {item.ReferenceNumber} Reimbursement for {item.SubmittedByName ?? "Courier"}",
                    Amount = item.ReimbursementAmount!.Value,
                    Status = "Completed",
                    OutflowDate = DateTime.UtcNow,
                    TransactionDate = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                });
            }

            // Update matching Cash Advance to Liquidated
            if (item.CashAdvanceId.HasValue)
            {
                var adv = await _fomsDb.CashAdvances.FirstOrDefaultAsync(a => a.AdvanceId == item.CashAdvanceId.Value.ToString() || a.AdvanceId == $"CA-{item.CashAdvanceId}");
                if (adv != null)
                {
                    adv.Status = "Liquidated";
                }
            }
            else
            {
                var adv = await _fomsDb.CashAdvances.FirstOrDefaultAsync(a => a.CourierName == item.SubmittedByName && a.Status != "Liquidated");
                if (adv != null)
                {
                    adv.Status = "Liquidated";
                }
            }
        }

        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = $"LIQUIDATION_{actionName.ToUpper()}",
            module = "Liquidations",
            role = "Assistant of Financial Manager",
            affected_record_id = item.LiquidationId,
            remarks = $"Liquidation {item.ReferenceNumber} action {actionName} -> {item.Status}. Leftover: ₱{item.LeftoverCash:N2}, Reimbursement: ₱{item.ReimbursementAmount:N2}. Remarks: {dto?.Notes ?? "Processed per FR-048-053"}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return Ok(item);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _fomsDb.Liquidations.FirstOrDefaultAsync(l => l.LiquidationId == id && l.IsDeleted != true);
        if (item == null) return NotFound(new { message = "Liquidation not found" });

        item.IsDeleted = true;
        item.Status = "Deleted";
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "DELETE_LIQUIDATION",
            module = "Liquidations",
            role = "Assistant of Financial Manager",
            affected_record_id = item.LiquidationId,
            remarks = $"Soft-deleted liquidation {item.ReferenceNumber}.",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return Ok(new { success = true, message = "Liquidation soft-deleted successfully." });
    }
}
