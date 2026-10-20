using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/receipts")]
[Route("api/v1/receipts")]
[ApiController]
public class ReceiptsController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public ReceiptsController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var receipts = await _context.PaymentReceipts
            .Include(r => r.PaymentTransaction)
            .ToListAsync();

        return Ok(receipts);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var receipt = await _context.PaymentReceipts
            .Include(r => r.PaymentTransaction)
            .FirstOrDefaultAsync(r => r.Id == id);

        return receipt == null ? NotFound() : Ok(receipt);
    }

    [Microsoft.AspNetCore.Authorization.AllowAnonymous]
    [HttpGet("checkout/{checkoutId}")]
    public async Task<IActionResult> GetByCheckoutId(string checkoutId)
    {
        var receipt = await _context.PaymentReceipts
            .Include(r => r.PaymentTransaction)
            .FirstOrDefaultAsync(r => r.PaymentTransaction != null && r.PaymentTransaction.PayMongoCheckoutId == checkoutId);

        return receipt == null ? NotFound() : Ok(receipt);
    }
}
