using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

public class BillingRateDto
{
    public string? Id { get; set; }
    public string? ClientId { get; set; }
    public string? Region { get; set; }
    public string? DeliveryArea { get; set; }
    public decimal? MinimumWeight { get; set; }
    public decimal? MinimumKg { get; set; }
    public decimal? MinimumRate { get; set; }
    public decimal? ExcessRate { get; set; }
    public decimal? ExcessRatePerKg { get; set; }
    public decimal? ValuationRate { get; set; }
    public decimal? FuelSurchargeRate { get; set; }
    public decimal? VatRate { get; set; }
    public string? EffectiveDate { get; set; }
    public DateOnly? EffectiveFrom { get; set; }
    public string? Status { get; set; }
    public bool? IsActive { get; set; }
}

[Authorize]
[ApiController]
[Route("api/billing-rates")]
[Route("api/v1/billing-rates")]
[Route("billing-rates")]
public class BillingRatesController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public BillingRatesController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _fomsDb.Clients.AnyAsync())
            {
                _fomsDb.Clients.AddRange(new List<FOMS.Domain.Entities.SqlServer.Client>
                {
                    new() { ClientId = 1, ClientCode = "LZD-001", CompanyName = "Lazada Philippines", ContactPerson = "John Doe", ContactNumber = "09171234567", Email = "contact@lazada.com", IsActive = true, CreatedAt = DateTime.UtcNow },
                    new() { ClientId = 2, ClientCode = "SHP-001", CompanyName = "Shopee Philippines", ContactPerson = "Jane Smith", ContactNumber = "09179876543", Email = "contact@shopee.com", IsActive = true, CreatedAt = DateTime.UtcNow }
                });
                await _fomsDb.SaveChangesAsync();
            }

            if (!await _fomsDb.ClientRates.AnyAsync())
            {
                var sampleRates = new List<ClientRate>
                {
                    // Lazada (ClientId: 1 / CA-001)
                    new() { ClientId = 1, DeliveryArea = "NCR", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 120m, ExcessRatePerKg = 20m, ValuationRate = 0.01m, FuelSurchargeRate = 0.05m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-3)), IsActive = true },
                    new() { ClientId = 1, DeliveryArea = "Luzon", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 180m, ExcessRatePerKg = 30m, ValuationRate = 0.01m, FuelSurchargeRate = 0.08m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-3)), IsActive = true },
                    new() { ClientId = 1, DeliveryArea = "Visayas", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 220m, ExcessRatePerKg = 40m, ValuationRate = 0.015m, FuelSurchargeRate = 0.10m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-3)), IsActive = true },
                    new() { ClientId = 1, DeliveryArea = "Mindanao", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 260m, ExcessRatePerKg = 50m, ValuationRate = 0.015m, FuelSurchargeRate = 0.12m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-3)), IsActive = true },

                    // Shopee (ClientId: 2 / CA-002)
                    new() { ClientId = 2, DeliveryArea = "NCR", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 110m, ExcessRatePerKg = 18m, ValuationRate = 0.01m, FuelSurchargeRate = 0.05m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-2)), IsActive = true },
                    new() { ClientId = 2, DeliveryArea = "Luzon", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 170m, ExcessRatePerKg = 28m, ValuationRate = 0.01m, FuelSurchargeRate = 0.08m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-2)), IsActive = true },
                    new() { ClientId = 2, DeliveryArea = "Visayas", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 210m, ExcessRatePerKg = 38m, ValuationRate = 0.015m, FuelSurchargeRate = 0.10m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-2)), IsActive = true },
                    new() { ClientId = 2, DeliveryArea = "Mindanao", ServiceType = "Standard Delivery", MinimumKg = 5m, MinimumRate = 250m, ExcessRatePerKg = 48m, ValuationRate = 0.015m, FuelSurchargeRate = 0.12m, EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-2)), IsActive = true },
                };
                _fomsDb.ClientRates.AddRange(sampleRates);
                await _fomsDb.SaveChangesAsync();
            }
        }
        catch { }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await EnsureSeededAsync();
        var rates = await _fomsDb.ClientRates.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var items = rates.Select(r =>
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == r.ClientId);
            string clientCode = c?.ClientCode ?? (r.ClientId == 1 ? "LZD-001" : r.ClientId == 2 ? "SHP-001" : r.ClientId.ToString());
            return new
            {
                id = r.RateId.ToString(),
                clientId = clientCode,
                clientName = c?.CompanyName ?? (clientCode == "LZD-001" || clientCode == "CA-001" ? "Lazada Philippines" : clientCode == "SHP-001" || clientCode == "CA-002" ? "Shopee Philippines" : $"Client {r.ClientId}"),
                region = r.DeliveryArea ?? "NCR",
                minimumWeight = r.MinimumKg ?? 5m,
                minimumRate = r.MinimumRate ?? 100m,
                excessRate = r.ExcessRatePerKg ?? 15m,
                valuationRate = r.ValuationRate ?? 0.01m,
                fuelSurchargeRate = r.FuelSurchargeRate ?? 0.05m,
                vatRate = 0.12m,
                effectiveDate = (r.EffectiveFrom ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd"),
                status = (r.IsActive ?? true) ? "Active" : "Inactive"
            };
        }).ToList();

        return Ok(items);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var r = await _fomsDb.ClientRates.FindAsync(id);
        if (r == null) return NotFound(new { message = "Rate not found" });

        var c = await _fomsDb.Clients.FindAsync(r.ClientId);
        string clientCode = c?.ClientCode ?? (r.ClientId == 1 ? "LZD-001" : r.ClientId == 2 ? "SHP-001" : r.ClientId.ToString());

        return Ok(new
        {
            id = r.RateId.ToString(),
            clientId = clientCode,
            clientName = c?.CompanyName ?? (clientCode == "LZD-001" || clientCode == "CA-001" ? "Lazada Philippines" : clientCode == "SHP-001" || clientCode == "CA-002" ? "Shopee Philippines" : $"Client {r.ClientId}"),
            region = r.DeliveryArea ?? "NCR",
            minimumWeight = r.MinimumKg ?? 5m,
            minimumRate = r.MinimumRate ?? 100m,
            excessRate = r.ExcessRatePerKg ?? 15m,
            valuationRate = r.ValuationRate ?? 0.01m,
            fuelSurchargeRate = r.FuelSurchargeRate ?? 0.05m,
            vatRate = 0.12m,
            effectiveDate = (r.EffectiveFrom ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd"),
            status = (r.IsActive ?? true) ? "Active" : "Inactive"
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BillingRateDto dto)
    {
        int targetClientId = 1;
        if (!string.IsNullOrEmpty(dto.ClientId))
        {
            if (dto.ClientId.Equals("LZD-001", StringComparison.OrdinalIgnoreCase) || dto.ClientId.Equals("CA-001", StringComparison.OrdinalIgnoreCase)) targetClientId = 1;
            else if (dto.ClientId.Equals("SHP-001", StringComparison.OrdinalIgnoreCase) || dto.ClientId.Equals("CA-002", StringComparison.OrdinalIgnoreCase)) targetClientId = 2;
            else if (int.TryParse(dto.ClientId, out var parsed)) targetClientId = parsed;
            else
            {
                var matched = await _fomsDb.Clients.FirstOrDefaultAsync(c => c.ClientCode == dto.ClientId || c.DmsClientId == dto.ClientId);
                if (matched != null) targetClientId = matched.ClientId;
            }
        }

        var entity = new ClientRate
        {
            ClientId = targetClientId,
            DeliveryArea = dto.Region ?? dto.DeliveryArea ?? "NCR",
            MinimumKg = dto.MinimumWeight ?? dto.MinimumKg ?? 5m,
            MinimumRate = dto.MinimumRate ?? 100m,
            ExcessRatePerKg = dto.ExcessRate ?? dto.ExcessRatePerKg ?? 15m,
            ValuationRate = dto.ValuationRate ?? 0.01m,
            FuelSurchargeRate = dto.FuelSurchargeRate ?? 0.05m,
            IsActive = dto.Status != null ? dto.Status.Equals("Active", StringComparison.OrdinalIgnoreCase) : (dto.IsActive ?? true),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        if (!string.IsNullOrEmpty(dto.EffectiveDate) && DateOnly.TryParse(dto.EffectiveDate, out var effDate))
        {
            entity.EffectiveFrom = effDate;
        }
        else if (dto.EffectiveFrom.HasValue)
        {
            entity.EffectiveFrom = dto.EffectiveFrom.Value;
        }
        else
        {
            entity.EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow);
        }

        _fomsDb.ClientRates.Add(entity);
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "CREATE_RATE_CONFIGURATION",
            module = "BillingRates",
            role = "Financial Manager",
            affected_record_id = entity.RateId,
            remarks = $"Created billing rate for Client {entity.ClientId} ({entity.DeliveryArea}): Base ₱{entity.MinimumRate}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        string clientCode = targetClientId == 1 ? "LZD-001" : targetClientId == 2 ? "SHP-001" : targetClientId.ToString();

        return CreatedAtAction(nameof(GetById), new { id = entity.RateId }, new
        {
            id = entity.RateId.ToString(),
            clientId = clientCode,
            region = entity.DeliveryArea,
            minimumWeight = entity.MinimumKg,
            minimumRate = entity.MinimumRate,
            excessRate = entity.ExcessRatePerKg,
            valuationRate = entity.ValuationRate,
            fuelSurchargeRate = entity.FuelSurchargeRate,
            vatRate = 0.12m,
            effectiveDate = (entity.EffectiveFrom ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd"),
            status = (entity.IsActive ?? true) ? "Active" : "Inactive"
        });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] BillingRateDto dto)
    {
        var entity = await _fomsDb.ClientRates.FindAsync(id);
        if (entity == null) return NotFound(new { message = "Rate configuration not found." });

        if (!string.IsNullOrEmpty(dto.ClientId))
        {
            if (dto.ClientId.Equals("LZD-001", StringComparison.OrdinalIgnoreCase) || dto.ClientId.Equals("CA-001", StringComparison.OrdinalIgnoreCase)) entity.ClientId = 1;
            else if (dto.ClientId.Equals("SHP-001", StringComparison.OrdinalIgnoreCase) || dto.ClientId.Equals("CA-002", StringComparison.OrdinalIgnoreCase)) entity.ClientId = 2;
            else if (int.TryParse(dto.ClientId, out var cId)) entity.ClientId = cId;
        }

        if (!string.IsNullOrEmpty(dto.Region) || !string.IsNullOrEmpty(dto.DeliveryArea))
            entity.DeliveryArea = dto.Region ?? dto.DeliveryArea;

        if (dto.MinimumWeight.HasValue || dto.MinimumKg.HasValue)
            entity.MinimumKg = dto.MinimumWeight ?? dto.MinimumKg;

        if (dto.MinimumRate.HasValue)
            entity.MinimumRate = dto.MinimumRate.Value;

        if (dto.ExcessRate.HasValue || dto.ExcessRatePerKg.HasValue)
            entity.ExcessRatePerKg = dto.ExcessRate ?? dto.ExcessRatePerKg;

        if (dto.ValuationRate.HasValue)
            entity.ValuationRate = dto.ValuationRate.Value;

        if (dto.FuelSurchargeRate.HasValue)
            entity.FuelSurchargeRate = dto.FuelSurchargeRate.Value;

        if (!string.IsNullOrEmpty(dto.Status))
            entity.IsActive = dto.Status.Equals("Active", StringComparison.OrdinalIgnoreCase);
        else if (dto.IsActive.HasValue)
            entity.IsActive = dto.IsActive.Value;

        if (!string.IsNullOrEmpty(dto.EffectiveDate) && DateOnly.TryParse(dto.EffectiveDate, out var effDate))
            entity.EffectiveFrom = effDate;

        entity.UpdatedAt = DateTime.UtcNow;
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "UPDATE_RATE_CONFIGURATION",
            module = "BillingRates",
            role = "Financial Manager",
            affected_record_id = entity.RateId,
            remarks = $"Updated billing rate {entity.RateId} ({entity.DeliveryArea}): Base ₱{entity.MinimumRate}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            id = entity.RateId.ToString(),
            clientId = entity.ClientId.ToString(),
            region = entity.DeliveryArea,
            minimumWeight = entity.MinimumKg,
            minimumRate = entity.MinimumRate,
            excessRate = entity.ExcessRatePerKg,
            valuationRate = entity.ValuationRate,
            fuelSurchargeRate = entity.FuelSurchargeRate,
            vatRate = 0.12m,
            effectiveDate = (entity.EffectiveFrom ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd"),
            status = (entity.IsActive ?? true) ? "Active" : "Inactive"
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entity = await _fomsDb.ClientRates.FindAsync(id);
        if (entity == null) return NotFound(new { message = "Rate configuration not found." });

        _fomsDb.ClientRates.Remove(entity);

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "DELETE_RATE_CONFIGURATION",
            module = "BillingRates",
            role = "Financial Manager",
            affected_record_id = id,
            remarks = $"Deleted billing rate configuration {id}",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();
        return Ok(new { success = true, message = "Rate deleted successfully." });
    }
}

public class BillingRecordInputDto
{
    public string? Id { get; set; }
    public string? WaybillId { get; set; }
    public string? ClientId { get; set; }
    public string? RateId { get; set; }
    public decimal? VolumeWeight { get; set; }
    public decimal? ActualWeight { get; set; }
    public decimal? ChargeableWeight { get; set; }
    public decimal? FreightCost { get; set; }
    public decimal? Valuation { get; set; }
    public decimal? OdaCharge { get; set; }
    public decimal? Subtotal { get; set; }
    public decimal? Vat { get; set; }
    public decimal? FuelSurcharge { get; set; }
    public decimal? GrandTotal { get; set; }
    public string? Status { get; set; }
    public string? Remarks { get; set; }
    public string? ComputedBy { get; set; }
}

[Authorize]
[ApiController]
[Route("api/billing-records")]
[Route("api/v1/billing-records")]
[Route("billing-records")]
public class BillingRecordsController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public BillingRecordsController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _fomsDb.BillingDocuments.AnyAsync())
            {
                var waybills = await _fomsDb.Waybills.Take(3).ToListAsync();
                int wb1 = waybills.Count > 0 ? waybills[0].WaybillId : 1;
                int wb2 = waybills.Count > 1 ? waybills[1].WaybillId : wb1;
                int wb3 = waybills.Count > 2 ? waybills[2].WaybillId : wb1;

                var samples = new List<BillingDocument>
                {
                    new() { WaybillId = wb1, ClientId = 1, ComputedAmount = 1850m, ValidationStatus = "Pending Review", CtcStatus = "Verified", CreatedAt = DateTime.UtcNow.AddDays(-1) },
                    new() { WaybillId = wb2, ClientId = 1, ComputedAmount = 2400m, ValidationStatus = "Pending Review", CtcStatus = "Verified", CreatedAt = DateTime.UtcNow.AddDays(-1) },
                    new() { WaybillId = wb3, ClientId = 2, ComputedAmount = 1450m, ValidationStatus = "Pending Review", CtcStatus = "Verified", CreatedAt = DateTime.UtcNow.AddHours(-12) }
                };
                _fomsDb.BillingDocuments.AddRange(samples);
                await _fomsDb.SaveChangesAsync();
            }
        }
        catch { }
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        await EnsureSeededAsync();
        var records = await _fomsDb.BillingDocuments.AsNoTracking().ToListAsync();
        var waybills = await _fomsDb.Waybills.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var items = records.Select(b =>
        {
            var wb = waybills.FirstOrDefault(w => w.WaybillId == b.WaybillId);
            var c = clients.FirstOrDefault(cl => cl.ClientId == b.ClientId);
            string clientCode = c?.ClientCode ?? (b.ClientId == 1 ? "CA-001" : b.ClientId == 2 ? "CA-002" : b.ClientId.ToString());
            return new
            {
                id = b.BillingDocId.ToString(),
                waybillId = b.WaybillId.ToString(),
                clientId = clientCode,
                clientCode = clientCode,
                clientName = c?.CompanyName ?? (clientCode == "CA-001" ? "Lazada Philippines" : clientCode == "CA-002" ? "Shopee Philippines" : $"Client {b.ClientId}"),
                rateId = "1",
                volumeWeight = 1m,
                actualWeight = wb?.ActualWeight ?? 1m,
                chargeableWeight = wb?.ActualWeight ?? 1m,
                freightCost = b.ComputedAmount,
                valuation = 0m,
                odaCharge = 0m,
                subtotal = b.ComputedAmount,
                vat = Math.Round(b.ComputedAmount * 0.12m, 2),
                fuelSurcharge = 0m,
                grandTotal = Math.Round(b.ComputedAmount * 1.12m, 2),
                status = b.ValidationStatus ?? "Pending Review",
                computedBy = "System",
                computedAt = (b.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss")
            };
        }).ToList();

        return Ok(items);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var b = await _fomsDb.BillingDocuments.FindAsync(id);
        if (b == null) return NotFound(new { message = "Billing document not found." });

        var wb = await _fomsDb.Waybills.FindAsync(b.WaybillId);
        var c = await _fomsDb.Clients.FindAsync(b.ClientId);

        return Ok(new
        {
            id = b.BillingDocId.ToString(),
            waybillId = b.WaybillId.ToString(),
            clientId = b.ClientId.ToString(),
            clientName = c?.CompanyName ?? $"Client {b.ClientId}",
            rateId = "1",
            volumeWeight = 1m,
            actualWeight = wb?.ActualWeight ?? 1m,
            chargeableWeight = wb?.ActualWeight ?? 1m,
            freightCost = b.ComputedAmount,
            valuation = 0m,
            odaCharge = 0m,
            subtotal = b.ComputedAmount,
            vat = Math.Round(b.ComputedAmount * 0.12m, 2),
            fuelSurcharge = 0m,
            grandTotal = Math.Round(b.ComputedAmount * 1.12m, 2),
            status = b.ValidationStatus ?? "Pending Review",
            computedBy = "System",
            computedAt = (b.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss")
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] BillingRecordInputDto dto)
    {
        var entity = new BillingDocument
        {
            WaybillId = int.TryParse(dto.WaybillId, out var wbId) ? wbId : 1,
            ClientId = int.TryParse(dto.ClientId, out var cId) ? cId : 1,
            ComputedAmount = dto.GrandTotal ?? dto.FreightCost ?? 100m,
            ValidationStatus = dto.Status ?? "Pending Review",
            CreatedAt = DateTime.UtcNow
        };

        _fomsDb.BillingDocuments.Add(entity);
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "SUBMIT_BILLING_RECORD",
            module = "BillingValidation",
            role = "Accountant",
            affected_record_id = entity.BillingDocId,
            remarks = $"Submitted billing record for Waybill {entity.WaybillId}: Amount ₱{entity.ComputedAmount}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = entity.BillingDocId }, new
        {
            id = entity.BillingDocId.ToString(),
            waybillId = entity.WaybillId.ToString(),
            clientId = entity.ClientId.ToString(),
            freightCost = entity.ComputedAmount,
            grandTotal = entity.ComputedAmount,
            status = entity.ValidationStatus
        });
    }

    [HttpPost("{id}/{actionName}")]
    [HttpPut("{id}")]
    public async Task<IActionResult> Transition(int id, string? actionName = null, [FromBody] BillingRecordInputDto? dto = null)
    {
        var b = await _fomsDb.BillingDocuments.FindAsync(id);
        if (b == null) return NotFound(new { message = "Billing record not found." });

        if (!string.IsNullOrEmpty(actionName))
        {
            b.ValidationStatus = actionName switch
            {
                "approve" or "verify" => "Approved",
                "reject" or "return" => "Returned",
                _ => b.ValidationStatus
            };
        }
        else if (dto != null && !string.IsNullOrEmpty(dto.Status))
        {
            b.ValidationStatus = dto.Status;
        }

        b.ValidatedAt = DateTime.UtcNow;
        b.ValidatedBy = 1;
        await _fomsDb.SaveChangesAsync();

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            action = "UPDATE_BILLING_RECORD",
            module = "BillingValidation",
            role = "Head Accountant",
            affected_record_id = b.BillingDocId,
            remarks = $"Billing record {b.BillingDocId} transitioned to {b.ValidationStatus}",
            created_at = DateTime.UtcNow
        });
        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            id = b.BillingDocId.ToString(),
            status = b.ValidationStatus
        });
    }
}
