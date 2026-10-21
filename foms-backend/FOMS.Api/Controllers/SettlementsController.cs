using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

public class SettlementInputDto
{
    public string? Id { get; set; }
    public string? Type { get; set; }
    public string? RecordType { get; set; }
    public string? CourierName { get; set; }
    public string? TripRef { get; set; }
    public string? CourierTrip { get; set; }
    public decimal? Amount { get; set; }
    public decimal? CashAdvance { get; set; }
    public decimal? TotalExpenses { get; set; }
    public string? EnvelopeNo { get; set; }
    public decimal? CashCounted { get; set; }
    public string? Status { get; set; }
    public string? RecordedBy { get; set; }
    public string? Remarks { get; set; }
}

[Authorize]
[ApiController]
[Route("api/settlements")]
[Route("api/v1/settlements")]
[Route("settlements")]
public class SettlementsController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public SettlementsController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    [HttpGet]
    public async Task<IActionResult> GetSettlements([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var query = _fomsDb.Settlements.AsNoTracking();
        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(s => s.SubmittedAt ?? s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new
            {
                id = s.SettlementId.ToString(),
                settlementId = s.SettlementId,
                recordId = $"SET-{s.SettlementId:D4}",
                type = s.RecordType ?? "Leftover return",
                recordType = s.RecordType ?? "Leftover return",
                courierName = s.CourierTrip != null && s.CourierTrip.Contains("-")
                    ? s.CourierTrip.Substring(0, s.CourierTrip.IndexOf("-")).Trim()
                    : (s.CourierTrip ?? "Courier Route"),
                tripRef = s.CourierTrip != null && s.CourierTrip.Contains("-")
                    ? s.CourierTrip.Substring(s.CourierTrip.IndexOf("-") + 1).Trim()
                    : $"TRIP-{s.SettlementId:D3}",
                courierTrip = s.CourierTrip ?? "Courier Route",
                amount = s.Amount,
                discrepancy = 0m,
                status = s.Status ?? "For validation",
                cashAdvance = s.Amount,
                totalExpenses = 0m,
                envelopeNo = $"ENV-{s.SettlementId:D4}",
                cashCounted = s.Amount,
                recordedBy = "Accountant",
                recordedAt = (s.CreatedAt ?? DateTime.UtcNow).ToString("o"),
                submittedAt = (s.SubmittedAt ?? s.CreatedAt ?? DateTime.UtcNow).ToString("o"),
                dateSubmitted = (s.SubmittedAt ?? s.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd")
            })
            .ToListAsync();

        return Ok(new
        {
            items,
            total,
            page,
            pageSize
        });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetSettlement(int id)
    {
        var item = await _fomsDb.Settlements.AsNoTracking().FirstOrDefaultAsync(s => s.SettlementId == id);
        if (item == null) return NotFound(new { message = "Settlement not found" });

        var courierName = item.CourierTrip != null && item.CourierTrip.Contains("-")
            ? item.CourierTrip.Substring(0, item.CourierTrip.IndexOf("-")).Trim()
            : (item.CourierTrip ?? "Courier Route");
        var tripRef = item.CourierTrip != null && item.CourierTrip.Contains("-")
            ? item.CourierTrip.Substring(item.CourierTrip.IndexOf("-") + 1).Trim()
            : $"TRIP-{item.SettlementId:D3}";

        return Ok(new
        {
            id = item.SettlementId.ToString(),
            item.SettlementId,
            recordId = $"SET-{item.SettlementId:D4}",
            type = item.RecordType ?? "Leftover return",
            recordType = item.RecordType,
            courierName,
            tripRef,
            courierTrip = item.CourierTrip,
            amount = item.Amount,
            discrepancy = 0m,
            status = item.Status ?? "For validation",
            cashAdvance = item.Amount,
            totalExpenses = 0m,
            envelopeNo = $"ENV-{item.SettlementId:D4}",
            cashCounted = item.Amount,
            recordedBy = "Accountant",
            recordedAt = (item.CreatedAt ?? DateTime.UtcNow).ToString("o"),
            submittedAt = (item.SubmittedAt ?? item.CreatedAt ?? DateTime.UtcNow).ToString("o"),
            dateSubmitted = (item.SubmittedAt ?? item.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
            item.ValidatedAt
        });
    }

    [HttpPost]
    public async Task<IActionResult> CreateSettlement([FromBody] SettlementInputDto dto)
    {
        var courierTrip = !string.IsNullOrEmpty(dto.CourierTrip)
            ? dto.CourierTrip
            : $"{dto.CourierName ?? "Courier"} - {dto.TripRef ?? "TRIP-001"}";

        var entity = new Settlement
        {
            RecordType = dto.Type ?? dto.RecordType ?? "Leftover return",
            CourierTrip = courierTrip,
            Amount = dto.Amount ?? dto.CashAdvance ?? 0m,
            Status = dto.Status ?? "For validation",
            CreatedAt = DateTime.UtcNow,
            SubmittedAt = DateTime.UtcNow
        };

        _fomsDb.Settlements.Add(entity);
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "CREATE_SETTLEMENT",
            module = "Settlements",
            role = "Accountant",
            affected_record_id = entity.SettlementId,
            remarks = $"Recorded settlement {entity.SettlementId} ({entity.RecordType}) for {entity.CourierTrip}: ₱{entity.Amount:N2}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return CreatedAtAction(nameof(GetSettlement), new { id = entity.SettlementId }, new
        {
            id = entity.SettlementId.ToString(),
            recordId = $"SET-{entity.SettlementId:D4}",
            type = entity.RecordType,
            courierName = dto.CourierName ?? "Courier",
            tripRef = dto.TripRef ?? "TRIP-001",
            amount = entity.Amount,
            status = entity.Status,
            submittedAt = (entity.SubmittedAt ?? DateTime.UtcNow).ToString("o")
        });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateSettlement(int id, [FromBody] SettlementInputDto dto)
    {
        var item = await _fomsDb.Settlements.FindAsync(id);
        if (item == null) return NotFound(new { message = "Settlement not found" });

        if (!string.IsNullOrEmpty(dto.Status))
            item.Status = dto.Status;

        if (dto.Amount.HasValue)
            item.Amount = dto.Amount.Value;

        if (!string.IsNullOrEmpty(dto.CourierTrip))
            item.CourierTrip = dto.CourierTrip;

        await _fomsDb.SaveChangesAsync();
        return Ok(new { id = item.SettlementId.ToString(), status = item.Status });
    }

    [HttpPost("{id}/{action}")]
    public async Task<IActionResult> ActOnSettlement(int id, string action, [FromBody] SettlementInputDto? dto)
    {
        var item = await _fomsDb.Settlements.FindAsync(id);
        if (item == null) return NotFound(new { message = "Settlement not found" });

        item.Status = action switch
        {
            "approve" or "validate" or "verify" => "Validated",
            "reject" => "Rejected",
            "return" => "Returned",
            _ => item.Status
        };
        item.ValidatedAt = DateTime.UtcNow;
        item.ValidatedBy = 1;
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = $"SETTLEMENT_{action.ToUpper()}",
            module = "Settlements",
            role = "Head Accountant",
            affected_record_id = item.SettlementId,
            remarks = $"Settlement {item.SettlementId} action {action} -> {item.Status}. Remarks: {dto?.Remarks ?? "N/A"}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return Ok(new { id = item.SettlementId.ToString(), status = item.Status });
    }
}
