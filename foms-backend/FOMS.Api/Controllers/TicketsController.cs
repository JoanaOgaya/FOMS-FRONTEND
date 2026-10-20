using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Features;

namespace FOMS.Api.Controllers;

[Route("api/tickets")]
[Route("tickets")]
public class TicketsController : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetTickets()
    {
        var list = await Mediator.Send(new TicketFeatures.GetTicketsQuery());
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TicketFeatures.CreateTicketCommand command)
    {
        var ticket = await Mediator.Send(command);
        return Ok(ticket);
    }

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(string id, [FromBody] TicketFeatures.UpdateTicketStatusCommand command)
    {
        if (id != command.Id) return BadRequest();
        var result = await Mediator.Send(command);
        if (!result) return NotFound();
        return Ok(new { success = true });
    }
}
