using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/roles")]
[ApiController]
public class RolesController : ControllerBase
{
    private readonly IUserService _userService;

    public RolesController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var roles = await _userService.GetRolesAsync();
        return Ok(roles);
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] RoleCreateDto request)
    {
        var role = await _userService.CreateRoleAsync(request);
        return CreatedAtAction(nameof(GetAll), new { id = role.Id }, role);
    }
}
