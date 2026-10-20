using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/activity-logs")]
[ApiController]
public class ActivityLogsController : ControllerBase
{
    private readonly IAuditService _auditService;

    public ActivityLogsController(IAuditService auditService)
    {
        _auditService = auditService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _auditService.GetActivityLogsAsync());
}
