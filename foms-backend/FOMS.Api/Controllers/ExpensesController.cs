using System.Threading.Tasks;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Features;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/expenses")]
[Route("expenses")]
public class ExpensesController : ApiControllerBase
{
    [Authorize]
    [HttpGet("transportation")]
    public async Task<IActionResult> GetExpenses()
    {
        var list = await Mediator.Send(new ExpenseFeatures.GetExpensesQuery());
        return Ok(list);
    }

    [Authorize]
    [HttpPost("transportation")]
    public async Task<IActionResult> Record([FromBody] ExpenseFeatures.RecordExpenseCommand command)
    {
        var addedBy = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
        var updatedCommand = command with { AddedBy = addedBy };
        var expense = await Mediator.Send(updatedCommand);
        return Ok(expense);
    }
}
