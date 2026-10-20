using System.Collections.Generic;
using System.Threading.Tasks;
using FOMS.Application.DTOs;

namespace FOMS.Application.Interfaces;

public interface IAuditService
{
    Task<IEnumerable<ActivityLogDto>> GetActivityLogsAsync();
    Task<IEnumerable<AuditLogDto>> GetAuditLogsAsync();
    Task LogAuditAsync(AuditLogDto auditEntry);
}
