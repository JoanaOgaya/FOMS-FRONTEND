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

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _fomsDb.Waybills.AnyAsync())
            {
                var samples = new List<Waybill>
                {
                    new() { ClientId = 1, WaybillNumber = "WB-NCR-88491", Origin = "Manila Hub", Destination = "Quezon City", DeliveryArea = "NCR", ActualWeight = 12.5m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-3), UpdatedAt = DateTime.UtcNow },
                    new() { ClientId = 1, WaybillNumber = "WB-NCR-88492", Origin = "Manila Hub", Destination = "Pampanga", DeliveryArea = "Luzon", ActualWeight = 8.0m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow },
                    new() { ClientId = 1, WaybillNumber = "WB-NCR-88493", Origin = "Cebu Hub", Destination = "Mandaue", DeliveryArea = "Visayas", ActualWeight = 15.2m, DeliveryStatus = "Delivered", PodStatus = "Pending", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow },
                    new() { ClientId = 2, WaybillNumber = "WB-NCR-88494", Origin = "Manila Hub", Destination = "Makati", DeliveryArea = "NCR", ActualWeight = 6.4m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-1), UpdatedAt = DateTime.UtcNow },
                    new() { ClientId = 2, WaybillNumber = "WB-NCR-88495", Origin = "Davao Hub", Destination = "Tagum", DeliveryArea = "Mindanao", ActualWeight = 22.0m, DeliveryStatus = "Delivered", PodStatus = "Pending", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-1), UpdatedAt = DateTime.UtcNow }
                };
                _fomsDb.Waybills.AddRange(samples);
                await _fomsDb.SaveChangesAsync();
            }
            else
            {
                var unbilledValidatedCount = await _fomsDb.Waybills.CountAsync(w => !w.IsBilled && (w.PodStatus == "Validated" || w.PodStatus == "Validated (CTC)"));
                if (unbilledValidatedCount < 10)
                {
                    var extraSamples = new List<Waybill>
                    {
                        // Zalora (Client 4)
                        new() { ClientId = 4, WaybillNumber = "WB-VAL-90008", Origin = "Manila Hub", Destination = "Bonifacio Global City, Taguig", DeliveryArea = "NCR", ActualWeight = 6.2m, DeclaredValue = 4200m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 4, WaybillNumber = "WB-VAL-90009", Origin = "Clark Hub", Destination = "San Fernando, Pampanga", DeliveryArea = "Luzon", ActualWeight = 12.0m, DeclaredValue = 7800m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-3), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 4, WaybillNumber = "WB-VAL-90010", Origin = "Cebu Hub", Destination = "Cebu Central, Cebu City", DeliveryArea = "Visayas", ActualWeight = 8.5m, DeclaredValue = 5500m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-3), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 4, WaybillNumber = "WB-VAL-90011", Origin = "Davao Hub", Destination = "Davao Central, Davao City", DeliveryArea = "Mindanao", ActualWeight = 15.0m, DeclaredValue = 11000m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-4), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 4, WaybillNumber = "WB-VAL-90012", Origin = "Manila Hub", Destination = "Ortigas Center, Pasig City", DeliveryArea = "NCR", ActualWeight = 3.8m, DeclaredValue = 2900m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-1), UpdatedAt = DateTime.UtcNow },

                        // Shopee (Client 2)
                        new() { ClientId = 2, WaybillNumber = "WB-VAL-90014", Origin = "Cebu Hub", Destination = "Bacolod City, Negros Occ", DeliveryArea = "Visayas", ActualWeight = 9.0m, DeclaredValue = 3200m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 2, WaybillNumber = "WB-VAL-90015", Origin = "Davao Hub", Destination = "Cagayan de Oro City", DeliveryArea = "Mindanao", ActualWeight = 14.2m, DeclaredValue = 5800m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-3), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 2, WaybillNumber = "WB-VAL-90016", Origin = "Manila Hub", Destination = "Quezon City", DeliveryArea = "NCR", ActualWeight = 5.5m, DeclaredValue = 2400m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-1), UpdatedAt = DateTime.UtcNow },

                        // TikTok Shop (Client 3)
                        new() { ClientId = 3, WaybillNumber = "WB-VAL-90017", Origin = "Clark Hub", Destination = "Baguio City, Benguet", DeliveryArea = "Luzon", ActualWeight = 8.4m, DeclaredValue = 3600m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 3, WaybillNumber = "WB-VAL-90018", Origin = "Cebu Hub", Destination = "Iloilo City", DeliveryArea = "Visayas", ActualWeight = 11.0m, DeclaredValue = 4900m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-3), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 3, WaybillNumber = "WB-VAL-90019", Origin = "Manila Hub", Destination = "Mandaluyong City", DeliveryArea = "NCR", ActualWeight = 4.2m, DeclaredValue = 1950m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-1), UpdatedAt = DateTime.UtcNow },

                        // Lazada (Client 1)
                        new() { ClientId = 1, WaybillNumber = "WB-VAL-90020", Origin = "Laguna Hub", Destination = "Calamba City, Laguna", DeliveryArea = "Luzon", ActualWeight = 9.8m, DeclaredValue = 4100m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-2), UpdatedAt = DateTime.UtcNow },
                        new() { ClientId = 1, WaybillNumber = "WB-VAL-90021", Origin = "Davao Hub", Destination = "General Santos City", DeliveryArea = "Mindanao", ActualWeight = 16.5m, DeclaredValue = 8700m, DeliveryStatus = "Delivered", PodStatus = "Validated", IsBilled = false, CreatedAt = DateTime.UtcNow.AddDays(-3), UpdatedAt = DateTime.UtcNow }
                    };

                    foreach (var s in extraSamples)
                    {
                        var existing = await _fomsDb.Waybills.FirstOrDefaultAsync(w => w.WaybillNumber == s.WaybillNumber);
                        if (existing == null)
                        {
                            _fomsDb.Waybills.Add(s);
                        }
                        else if (existing.IsBilled)
                        {
                            existing.IsBilled = false;
                            existing.PodStatus = "Validated";
                            existing.DeliveryStatus = "Delivered";
                            existing.InvoiceId = null;
                            existing.InvoiceNo = null;
                        }
                    }
                    await _fomsDb.SaveChangesAsync();
                }
            }
        }
        catch { }
    }

    [HttpGet]
    public async Task<IActionResult> GetShipments([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        await EnsureSeededAsync();
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
