using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/shipment-pricing")]
[Route("api/v1/shipment-pricing")]
[ApiController]
public class ShipmentPricingController : ApiControllerBase
{
    private readonly IRepository<ShipmentPricing> _repository;
    private readonly IApplicationDbContext _context;

    public ShipmentPricingController(IRepository<ShipmentPricing> repository, IApplicationDbContext context)
    {
        _repository = repository;
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var items = await _repository.GetAllAsync();
        return Ok(items);
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ShipmentPricing request)
    {
        await _repository.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetById), new { id = request.Id }, request);
    }

    [HttpGet("rates")]
    public async Task<IActionResult> GetRates()
    {
        var rates = await Mediator.Send(new FOMS.Application.Features.ShipmentPricingFeatures.GetRatesQuery());
        return Ok(rates);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var item = await _repository.GetByIdAsync(id);
        return item == null ? NotFound() : Ok(item);
    }

    [HttpPost("compute")]
    public IActionResult Compute([FromBody] ShipmentPricing request)
    {
        var estimatedCharge = request.BaseRate + (request.RatePerKg * request.MinimumCharge);
        return Ok(new { request.Origin, request.Destination, EstimatedCharge = estimatedCharge });
    }
}
