using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/shipment-records")]
[Route("api/v1/shipment-records")]
[Route("shipment-records")]
[Route("api/waybills")]
[Route("api/v1/waybills")]
[Route("waybills")]
public class ShipmentRecordsController : ApiControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly FomsDbContext _fomsDb;

    public ShipmentRecordsController(IApplicationDbContext context, FomsDbContext fomsDb)
    {
        _context = context;
        _fomsDb = fomsDb;
    }

    [HttpGet]
    public async Task<IActionResult> GetShipments([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var waybills = await _fomsDb.Waybills.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var items = waybills.Select(w =>
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == w.ClientId);
            string clientCode = c?.ClientCode ?? (w.ClientId == 1 ? "LZD-001" : w.ClientId == 2 ? "SHP-001" : w.ClientId == 3 ? "TKT-001" : w.ClientId == 4 ? "ZAL-001" : w.ClientId.ToString());
            return new
            {
                id = w.WaybillId.ToString(),
                waybillNumber = w.WaybillNumber,
                trackingNumber = w.WaybillNumber,
                clientId = clientCode,
                clientCode = clientCode,
                clientName = c?.CompanyName ?? (clientCode == "LZD-001" || clientCode == "CA-001" ? "Lazada Philippines" : clientCode == "SHP-001" || clientCode == "CA-002" ? "Shopee Philippines" : clientCode == "TKT-001" || clientCode == "CA-003" ? "TikTok Shop Philippines" : clientCode == "ZAL-001" || clientCode == "CA-004" ? "Zalora Philippines" : $"Client {w.ClientId}"),
                origin = w.Origin ?? "Manila",
                destination = w.Destination ?? "Cebu",
                deliveryArea = w.DeliveryArea ?? "NCR",
                destinationArea = w.DeliveryArea ?? "NCR",
                actualWeight = w.ActualWeight ?? 1m,
                volumeWeight = 1m,
                chargeableWeight = w.ActualWeight ?? 1m,
                status = w.PodStatus ?? "Validated",
                deliveryStatus = w.DeliveryStatus ?? "Delivered",
                podStatus = w.PodStatus ?? "Validated",
                hasOriginalPOD = true,
                hasApprovedCTC = true,
                ctcStatus = "Standard",
                isBilled = w.IsBilled,
                invoiceId = w.InvoiceNo ?? w.InvoiceId?.ToString(),
                invoiceNo = w.InvoiceNo,
                date = (w.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
                deliveryDate = (w.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
                encodedBy = "Operations",
                encodedAt = (w.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
                createdAt = (w.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss")
            };
        }).ToList();

        return Ok(items);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var w = await _fomsDb.Waybills.FindAsync(id);
        if (w == null) return NotFound(new { message = "Waybill not found" });

        var c = await _fomsDb.Clients.FindAsync(w.ClientId);
        return Ok(new
        {
            id = w.WaybillId.ToString(),
            waybillNumber = w.WaybillNumber,
            trackingNumber = w.WaybillNumber,
            clientId = w.ClientId.ToString(),
            clientName = c?.CompanyName ?? $"Client {w.ClientId}",
            origin = w.Origin,
            destination = w.Destination,
            deliveryArea = w.DeliveryArea,
            actualWeight = w.ActualWeight,
            status = w.DeliveryStatus,
            podStatus = w.PodStatus,
            isBilled = w.IsBilled,
            invoiceId = w.InvoiceNo ?? w.InvoiceId?.ToString(),
            invoiceNo = w.InvoiceNo
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Waybill w)
    {
        w.CreatedAt = DateTime.UtcNow;
        w.UpdatedAt = DateTime.UtcNow;
        _fomsDb.Waybills.Add(w);
        await _fomsDb.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = w.WaybillId }, w);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] System.Text.Json.JsonElement body)
    {
        FOMS.Domain.Entities.SqlServer.Waybill? w = null;
        if (int.TryParse(id, out var intId))
        {
            w = await _fomsDb.Waybills.FindAsync(intId);
        }
        if (w == null)
        {
            w = await _fomsDb.Waybills.FirstOrDefaultAsync(x => x.WaybillNumber == id);
        }
        if (w == null) return NotFound(new { message = "Waybill not found" });

        if (body.TryGetProperty("status", out var statusProp))
        {
            var s = statusProp.GetString();
            if (s == "Billed")
            {
                w.IsBilled = true;
                w.PodStatus = "Billed";
            }
            else if (!string.IsNullOrEmpty(s))
            {
                w.PodStatus = s;
            }
        }
        if (body.TryGetProperty("isBilled", out var billedProp))
        {
            w.IsBilled = billedProp.GetBoolean();
        }
        if (body.TryGetProperty("invoiceNo", out var invNoProp))
        {
            w.InvoiceNo = invNoProp.GetString();
        }
        if (body.TryGetProperty("invoiceId", out var invProp))
        {
            if (invProp.TryGetInt32(out var invId))
            {
                w.InvoiceId = invId;
            }
            else
            {
                var strId = invProp.GetString();
                if (!string.IsNullOrEmpty(strId)) w.InvoiceNo = strId;
            }
        }

        w.UpdatedAt = DateTime.UtcNow;
        await _fomsDb.SaveChangesAsync();
        return Ok(w);
    }

    [HttpPost("{id}/{actionName}")]
    public async Task<IActionResult> Act(int id, string actionName)
    {
        var w = await _fomsDb.Waybills.FindAsync(id);
        if (w == null) return NotFound(new { message = "Waybill not found" });

        if (actionName == "validate" || actionName == "approve")
        {
            w.PodStatus = "Validated";
        }
        await _fomsDb.SaveChangesAsync();
        return Ok(w);
    }
}
