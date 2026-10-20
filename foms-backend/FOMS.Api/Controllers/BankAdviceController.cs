using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/bank-advice")]
[ApiController]
public class BankAdviceController : ControllerBase
{
    private readonly IRepository<BankAdviceRecord> _repository;
    private readonly IApplicationDbContext _context;

    public BankAdviceController(IRepository<BankAdviceRecord> repository, IApplicationDbContext context)
    {
        _repository = repository;
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _repository.GetAllAsync());

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BankAdviceRecord request)
    {
        await _repository.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetAll), new { id = request.Id }, request);
    }
}
