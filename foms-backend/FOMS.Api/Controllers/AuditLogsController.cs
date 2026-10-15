using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

public class AuditLogInputDto
{
    public string? Action { get; set; }
    public string? Module { get; set; }
    public string? EntityName { get; set; }
    public string? RecordId { get; set; }
    public string? EntityId { get; set; }
    public string? RecordType { get; set; }
    public string? Details { get; set; }
    public string? Remarks { get; set; }
    public string? IpAddress { get; set; }
    public string? UserId { get; set; }
    public string? UserFullName { get; set; }
    public string? UserRole { get; set; }
}

[Authorize]
[ApiController]
[Route("api/audit-logs")]
[Route("api/v1/audit-logs")]
[Route("audit-logs")]
public class AuditLogsController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public AuditLogsController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _fomsDb.AuditLogs.AnyAsync())
            {
                var samples = new List<AuditLog>
                {
                    new() { action = "USER_LOGIN", module = "Authentication", role = "Financial Manager", user_id = 1, remarks = "User EMP-001 logged into Financial Operations System.", created_at = DateTime.UtcNow.AddHours(-1) },
                    new() { action = "INVOICE_CREATED", module = "Invoices", role = "Financial Manager", user_id = 1, remarks = "Created invoice LZD-2026-0001 for Lazada Philippines (₱50,000.00).", created_at = DateTime.UtcNow.AddHours(-3) },
                    new() { action = "SETTINGS_UPDATED", module = "BillingRates", role = "Financial Manager", user_id = 1, remarks = "Updated regional rate matrix configurations for Metro Manila.", created_at = DateTime.UtcNow.AddHours(-5) },
                    new() { action = "COLLECTION_RECORDED", module = "Collections", role = "Financial Manager", user_id = 1, remarks = "Recorded SpeedPay collection verification for TX-9844.", created_at = DateTime.UtcNow.AddHours(-8) },
                    new() { action = "REPORT_GENERATED", module = "Reports", role = "Financial Manager", user_id = 1, remarks = "Generated Accounts Receivable Aging summary report.", created_at = DateTime.UtcNow.AddDays(-1) }
                };
                _fomsDb.AuditLogs.AddRange(samples);
                await _fomsDb.SaveChangesAsync();
            }
        }
        catch { }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var logs = await _fomsDb.AuditLogs
            .OrderByDescending(a => a.created_at)
            .AsNoTracking()
            .ToListAsync();

        var result = logs.Select(a => new
        {
            id = a.audit_id.ToString(),
            auditId = a.audit_id,
            timestamp = (a.created_at ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
            loggedAt = (a.created_at ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
            userId = a.user_id?.ToString() ?? "EMP-001",
            userFullName = a.user_id == 1 ? "Crystalyn Joyce C. Fajardo" : $"User {a.user_id}",
            userRole = a.role ?? "Financial Manager",
            role = a.role ?? "Financial Manager",
            action = a.action,
            module = a.module,
            entityName = a.module,
            recordId = a.affected_record_id?.ToString() ?? a.audit_id.ToString(),
            entityId = a.affected_record_id?.ToString() ?? a.audit_id.ToString(),
            details = a.remarks ?? a.after_value ?? a.action,
            remarks = a.remarks ?? a.after_value ?? a.action,
            ipAddress = "127.0.0.1"
        }).ToList();

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AuditLogInputDto dto)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? dto.UserRole ?? "User";
        var user = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? dto.UserId ?? "EMP-001";

        int? recId = null;
        if (int.TryParse(dto.RecordId, out var parsedRecId)) recId = parsedRecId;
        else if (int.TryParse(dto.EntityId, out var parsedEntId)) recId = parsedEntId;

        var entity = new AuditLog
        {
            user_id = 1,
            role = role,
            action = dto.Action ?? "USER_ACTION",
            module = dto.Module ?? dto.EntityName ?? "General",
            affected_record_id = recId,
            remarks = dto.Details ?? dto.Remarks ?? $"{dto.Action} on {dto.Module}",
            created_at = DateTime.UtcNow
        };

        _fomsDb.AuditLogs.Add(entity);
        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            id = entity.audit_id.ToString(),
            auditId = entity.audit_id,
            timestamp = (entity.created_at ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
            loggedAt = (entity.created_at ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
            userId = user,
            userFullName = dto.UserFullName ?? user,
            userRole = role,
            action = entity.action,
            module = entity.module,
            details = entity.remarks
        });
    }
}
