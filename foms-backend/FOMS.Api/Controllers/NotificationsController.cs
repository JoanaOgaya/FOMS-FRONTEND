using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/notifications")]
[Route("api/v1/notifications")]
[ApiController]
public class NotificationsController : ControllerBase
{
    private readonly IRepository<Notification> _repository;
    private readonly IApplicationDbContext _context;

    public NotificationsController(IRepository<Notification> repository, IApplicationDbContext context)
    {
        _repository = repository;
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _repository.GetAllAsync());

    [Authorize]
    [HttpPut("{id}/read")]
    public async Task<IActionResult> MarkRead(string id)
    {
        var notification = await _repository.GetByIdAsync(id);
        if (notification == null) return NotFound();

        notification.Read = true;
        _context.Notifications.Update(notification);
        await _context.SaveChangesAsync(default);
        return Ok(notification);
    }
}
