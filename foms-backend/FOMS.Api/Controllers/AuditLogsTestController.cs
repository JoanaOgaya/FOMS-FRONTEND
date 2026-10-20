using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[ApiController]
[Route("api/test")]
public class AuditLogsTestController : ControllerBase
{
    private readonly FomsDbContext _dbContext;

    public AuditLogsTestController(FomsDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs()
    {
        try
        {
            var logs = await _dbContext.AuditLogs
                .OrderBy(a => a.audit_id)
                .Take(10)
                .Select(a => new
                {
                    audit_id = a.audit_id,
                    role = a.role,
                    action = a.action,
                    module = a.module,
                    remarks = a.remarks
                })
                .ToListAsync();

            return Ok(new
            {
                success = true,
                source = "Microsoft SQL Server",
                database = "FOMS_DB",
                table = "AuditLogs",
                count = logs.Count,
                data = logs
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                success = false,
                source = "Microsoft SQL Server",
                database = "FOMS_DB",
                table = "AuditLogs",
                message = ex.Message
            });
        }
    }

    [HttpPost("audit-logs")]
    public async Task<IActionResult> CreateAuditLog([FromBody] CreateAuditLogRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Action) || string.IsNullOrWhiteSpace(request.Module))
            {
                return BadRequest(new { success = false, message = "Action and Module are required." });
            }

            var newLog = new AuditLog
            {
                role = request.Role,
                action = request.Action,
                module = request.Module,
                remarks = request.Remarks,
                created_at = DateTime.UtcNow
            };

            _dbContext.AuditLogs.Add(newLog);
            await _dbContext.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = "Audit log inserted successfully.",
                data = new
                {
                    role = newLog.role,
                    action = newLog.action,
                    module = newLog.module,
                    remarks = newLog.remarks
                }
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                success = false,
                message = "Failed to insert audit log.",
                error = ex.Message
            });
        }
    }
}

public class CreateAuditLogRequest
{
    public string? Role { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string? Remarks { get; set; }
}
