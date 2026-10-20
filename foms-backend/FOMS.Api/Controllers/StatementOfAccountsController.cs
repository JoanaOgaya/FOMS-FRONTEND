using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/statement-of-accounts")]
[ApiController]
public class StatementOfAccountsController : ControllerBase
{
    private readonly IRepository<StatementOfAccount> _repository;
    private readonly IApplicationDbContext _context;

    public StatementOfAccountsController(IRepository<StatementOfAccount> repository, IApplicationDbContext context)
    {
        _repository = repository;
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _repository.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var record = await _repository.GetByIdAsync(id);
        return record == null ? NotFound() : Ok(record);
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] StatementOfAccount request)
    {
        await _repository.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetById), new { id = request.Id }, request);
    }
}
