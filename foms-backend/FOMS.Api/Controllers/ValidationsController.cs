using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Features;

namespace FOMS.Api.Controllers;

[Route("api/validations")]
[Route("validations")]
public class ValidationsController : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetValidations()
    {
        var list = await Mediator.Send(new ValidationFeatures.GetValidationsQuery());
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] ValidationFeatures.SubmitValidationCommand command)
    {
        var validation = await Mediator.Send(command);
        return Ok(validation);
    }

    [HttpPut("{id}/verify")]
    public async Task<IActionResult> Verify(string id, [FromBody] ValidationFeatures.VerifyValidationCommand command)
    {
        if (id != command.Id) return BadRequest();
        var result = await Mediator.Send(command);
        if (!result) return NotFound();
        return Ok(new { success = true });
    }
}
