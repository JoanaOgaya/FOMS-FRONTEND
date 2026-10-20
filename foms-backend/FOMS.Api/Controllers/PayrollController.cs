using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/payroll-records")]
[ApiController]
public class PayrollController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public PayrollController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetPayrollRecords() => Ok(await _context.PayrollRecords.Include(r => r.DeductionLines).ToListAsync());

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> CreatePayrollRecord([FromBody] PayrollRecord request)
    {
        await _context.PayrollRecords.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetPayrollRecords), new { id = request.Id }, request);
    }
}
