using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Features;

namespace FOMS.Api.Controllers;

[Route("api/logs")]
[Route("logs")]
public class LogsController : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetLogs()
    {
        var logs = await Mediator.Send(new LogFeatures.GetLogsQuery());
        return Ok(logs);
    }

    [HttpPost]
    public async Task<IActionResult> CreateLog([FromBody] LogFeatures.CreateLogCommand command)
    {
        var log = await Mediator.Send(command);
        return Ok(log);
    }
}
