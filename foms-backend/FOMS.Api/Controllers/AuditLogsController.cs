using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

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
    private readonly IApplicationDbContext _context;

    public AuditLogsController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var logs = await _context.AuditLogs
            .AsNoTracking()
            .OrderByDescending(a => a.LoggedAt)
            .ToListAsync();
        var userIds = logs
            .Select(log => log.UserId)
            .Where(userId => !string.IsNullOrWhiteSpace(userId))
            .Distinct()
            .ToList();
        var users = await _context.Employees
            .AsNoTracking()
            .Where(employee => userIds.Contains(employee.Id))
            .ToDictionaryAsync(employee => employee.Id, employee => employee.Name);

        var result = logs.Select(a => new
        {
            id = a.Id,
            auditId = a.Id,
            timestamp = a.LoggedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
            loggedAt = a.LoggedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
            userId = a.UserId,
            userFullName = users.GetValueOrDefault(a.UserId, a.UserId),
            userRole = string.Empty,
            role = string.Empty,
            action = a.Action,
            module = a.EntityName,
            entityName = a.EntityName,
            recordId = a.EntityId,
            entityId = a.EntityId,
            recordType = a.EntityName,
            details = a.Details,
            remarks = a.Details,
            ipAddress = string.Empty
        }).ToList();

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AuditLogInputDto dto)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? dto.UserRole ?? "User";
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? dto.UserId
            ?? "EMP-001";
        var userName = User.FindFirst("name")?.Value
            ?? User.FindFirst(ClaimTypes.Name)?.Value
            ?? dto.UserFullName
            ?? userId;
        var entityName = dto.Module ?? dto.EntityName ?? dto.RecordType ?? "General";
        var entityId = dto.RecordId ?? dto.EntityId ?? string.Empty;
        var action = dto.Action ?? "USER_ACTION";
        var details = dto.Details ?? dto.Remarks ?? $"{action} on {entityName}";
        var audit = new AuditLog
        {
            UserId = userId,
            EntityName = entityName,
            EntityId = entityId,
            Action = action,
            Details = details,
            LoggedAt = DateTime.UtcNow
        };

        _context.AuditLogs.Add(audit);
        await _context.SaveChangesAsync(CancellationToken.None);

        return Ok(new
        {
            id = audit.Id,
            auditId = audit.Id,
            timestamp = audit.LoggedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
            loggedAt = audit.LoggedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
            userId = audit.UserId,
            userFullName = userName,
            userRole = role,
            role,
            action = audit.Action,
            module = audit.EntityName,
            entityName = audit.EntityName,
            recordId = audit.EntityId,
            entityId = audit.EntityId,
            recordType = audit.EntityName,
            details = audit.Details,
            remarks = audit.Details,
            ipAddress = string.Empty
        });
    }
}
