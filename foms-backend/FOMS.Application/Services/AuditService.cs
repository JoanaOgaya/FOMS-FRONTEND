using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Services;

public class AuditService : IAuditService
{
    private readonly IApplicationDbContext _context;

    public AuditService(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<ActivityLogDto>> GetActivityLogsAsync()
    {
        return await _context.UserActivityLogs
            .AsNoTracking()
            .Select(log => new ActivityLogDto
            {
                Id = log.Id,
                Timestamp = log.Timestamp,
                UserId = log.UserId,
                UserName = log.Action,
                Action = log.Action,
                Description = log.Description,
                ReferenceId = log.Id
            })
            .ToListAsync();
    }

    public async Task<IEnumerable<AuditLogDto>> GetAuditLogsAsync()
    {
        return await _context.AuditLogs
            .AsNoTracking()
            .Select(log => new AuditLogDto
            {
                Id = log.Id,
                LoggedAt = log.LoggedAt,
                UserId = log.UserId,
                EntityName = log.EntityName,
                EntityId = log.EntityId,
                Action = log.Action,
                Details = log.Details
            })
            .ToListAsync();
    }

    public async Task LogAuditAsync(AuditLogDto auditEntry)
    {
        var audit = new AuditLog
        {
            UserId = auditEntry.UserId,
            EntityName = auditEntry.EntityName,
            EntityId = auditEntry.EntityId,
            Action = auditEntry.Action,
            Details = auditEntry.Details,
            LoggedAt = auditEntry.LoggedAt
        };

        await _context.AuditLogs.AddAsync(audit);
        await _context.SaveChangesAsync(default);
    }
}
