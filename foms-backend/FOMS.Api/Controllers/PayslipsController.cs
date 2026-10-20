using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/payslips")]
[ApiController]
public class PayslipsController : ControllerBase
{
    private readonly IRepository<Payslip> _repository;
    private readonly IApplicationDbContext _context;

    public PayslipsController(IRepository<Payslip> repository, IApplicationDbContext context)
    {
        _repository = repository;
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _repository.GetAllAsync());

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Payslip request)
    {
        await _repository.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return Ok(request);
    }
}
