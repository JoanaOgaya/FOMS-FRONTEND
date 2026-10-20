using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/speedpay-transactions")]
[ApiController]
public class SpeedPayTransactionsController : ControllerBase
{
    private readonly IRepository<SpeedPayTransaction> _repository;
    private readonly IApplicationDbContext _context;

    public SpeedPayTransactionsController(IRepository<SpeedPayTransaction> repository, IApplicationDbContext context)
    {
        _repository = repository;
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _repository.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var transaction = await _repository.GetByIdAsync(id);
        return transaction == null ? NotFound() : Ok(transaction);
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SpeedPayTransaction request)
    {
        await _repository.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetById), new { id = request.Id }, request);
    }
}
