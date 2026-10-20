using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/payment-concern-tickets")]
[ApiController]
public class PaymentConcernTicketsController : ControllerBase
{
    private readonly IRepository<PaymentConcernTicket> _repository;
    private readonly IApplicationDbContext _context;

    public PaymentConcernTicketsController(IRepository<PaymentConcernTicket> repository, IApplicationDbContext context)
    {
        _repository = repository;
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _repository.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var ticket = await _repository.GetByIdAsync(id);
        return ticket == null ? NotFound() : Ok(ticket);
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] PaymentConcernTicket request)
    {
        await _repository.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetById), new { id = request.Id }, request);
    }
}
