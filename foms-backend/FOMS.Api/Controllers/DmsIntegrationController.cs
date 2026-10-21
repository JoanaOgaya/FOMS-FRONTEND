using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

#region DMS Integration DTOs

public class DmsDeliveryCompletedDto
{
    [Required]
    public string WaybillNumber { get; set; } = string.Empty;

    public string? ClientCode { get; set; }
    public int? ClientId { get; set; }
    public string? ClientName { get; set; }

    public string? Origin { get; set; } = "Manila Hub";
    public string? Destination { get; set; }
    public string DeliveryArea { get; set; } = "NCR"; // NCR, Luzon, Visayas, Mindanao

    [Range(0.01, 10000)]
    public decimal ActualWeight { get; set; } = 1.0m;

    public decimal? LengthCm { get; set; }
    public decimal? WidthCm { get; set; }
    public decimal? HeightCm { get; set; }
    public int? NumberOfBoxes { get; set; } = 1;

    public decimal? DeclaredValue { get; set; } = 1000.0m;

    [Required]
    public string PodUrl { get; set; } = string.Empty;

    public string? PodStatus { get; set; } = "Validated";
    public string? RecipientName { get; set; }
    public DateTime? DeliveryDate { get; set; } = DateTime.UtcNow;
    public string? DriverName { get; set; }
    public bool AutoGenerateInvoice { get; set; } = true;
}

public class DmsDeliveryFailedDto
{
    [Required]
    public string WaybillNumber { get; set; } = string.Empty;

    [Required]
    public string FailureReason { get; set; } = string.Empty; // FR-013: Consignee Not Available, Incomplete Address, Refused Delivery

    public int AttemptCount { get; set; } = 1;
    public string? DriverName { get; set; }
    public string? Remarks { get; set; }
    public DateTime? FailedAt { get; set; } = DateTime.UtcNow;
}

public class DmsRedeliveryCompletedDto
{
    [Required]
    public string WaybillNumber { get; set; } = string.Empty;

    [Required]
    public string PodUrl { get; set; } = string.Empty;

    public string? RecipientName { get; set; }
    public string? DriverName { get; set; }
    public DateTime? CompletedAt { get; set; } = DateTime.UtcNow;
    public string? Remarks { get; set; }
}

public class DmsCashAdvanceDto
{
    public string? AdvanceId { get; set; }
    [Required]
    public string CourierName { get; set; } = string.Empty;
    [Required]
    public string TripReference { get; set; } = string.Empty;
    [Required]
    [Range(1.0, 1000000.0)]
    public decimal AmountGiven { get; set; }
    public string? Purpose { get; set; }
    public string? Notes { get; set; }
    public string? ReleasedBy { get; set; } = "DMS Operations Dispatch";
    public DateTime? ReleaseDate { get; set; } = DateTime.UtcNow;
}

public class DmsLiquidationItemDto
{
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? ReceiptUrl { get; set; }
}

public class DmsLiquidationDto
{
    public string? ReferenceNumber { get; set; }
    [Required]
    public string CashAdvanceId { get; set; } = string.Empty;
    public string? CourierName { get; set; }
    public string? SubmittedByName { get; set; }
    public string? TripReference { get; set; }
    [Required]
    public decimal TotalExpenses { get; set; }
    public decimal LeftoverCash { get; set; } = 0.0m;
    public decimal ReimbursementAmount { get; set; } = 0.0m;
    public List<DmsLiquidationItemDto> Expenses { get; set; } = new();
    public List<string> DocumentUrls { get; set; } = new();
    public string? Remarks { get; set; }
}

#endregion

[ApiController]
[Route("api/integration/dms")]
public class DmsIntegrationController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;
    private readonly ILogger<DmsIntegrationController> _logger;

    public DmsIntegrationController(FomsDbContext fomsDb, ILogger<DmsIntegrationController> logger)
    {
        _fomsDb = fomsDb;
        _logger = logger;
    }

    /// <summary>
    /// DMS ↔ FOMS Integration #1: Completed Delivery → Billing / AR.
    /// Ingests waybill details & POD, validates docs (FR-011, 012), applies billing rate (FR-010),
    /// generates BillingDocument (FR-015), creates invoice (FR-015–020), and records Accounts Receivable (FR-023).
    /// </summary>
    [HttpPost("delivery-completed")]
    [AllowAnonymous]
    public async Task<IActionResult> DeliveryCompleted([FromBody] DmsDeliveryCompletedDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.WaybillNumber))
            return BadRequest(new { isSuccess = false, message = "WaybillNumber is required" });

        // Resolve Client from FOMS_DB
        var client = await _fomsDb.Clients.FirstOrDefaultAsync(c =>
            (dto.ClientId.HasValue && c.ClientId == dto.ClientId.Value) ||
            (!string.IsNullOrEmpty(dto.ClientCode) && (c.ClientCode == dto.ClientCode || c.DmsClientId == dto.ClientCode)) ||
            (!string.IsNullOrEmpty(dto.ClientName) && c.CompanyName == dto.ClientName));

        int clientId = client?.ClientId ?? dto.ClientId ?? 1;
        string clientName = client?.CompanyName ?? dto.ClientName ?? "Lazada Philippines";

        // FR-011, FR-012: Document validation (check POD availability)
        bool podValid = !string.IsNullOrWhiteSpace(dto.PodUrl);
        string podStatus = podValid ? "Validated" : "Pending POD";

        // Calculate Volumetric & Chargeable Weight
        decimal volWeight = 0m;
        if (dto.LengthCm.HasValue && dto.WidthCm.HasValue && dto.HeightCm.HasValue && dto.LengthCm > 0 && dto.WidthCm > 0 && dto.HeightCm > 0)
        {
            volWeight = Math.Round((dto.LengthCm.Value * dto.WidthCm.Value * dto.HeightCm.Value) / 3500m, 2);
        }
        decimal chargeableWeight = Math.Max(dto.ActualWeight, volWeight > 0 ? volWeight : dto.ActualWeight);

        // FR-010: Apply client billing rate dynamically from dbo.ClientRates
        var clientRate = await _fomsDb.ClientRates
            .Where(r => r.ClientId == clientId && (r.DeliveryArea == dto.DeliveryArea || r.DeliveryArea == "ALL" || string.IsNullOrEmpty(r.DeliveryArea)))
            .OrderByDescending(r => r.DeliveryArea == dto.DeliveryArea ? 1 : 0)
            .FirstOrDefaultAsync();

        decimal minKg = clientRate?.MinimumKg ?? 3.0m;
        decimal minRate = clientRate?.MinimumRate ?? 120.0m;
        decimal excessRate = clientRate?.ExcessRatePerKg ?? 35.0m;
        decimal fuelRate = clientRate?.FuelSurchargeRate ?? 0.08m; // 8% default
        decimal valRate = clientRate?.ValuationRate ?? 0.01m; // 1% default
        decimal odaRate = clientRate?.OdaRate ?? 0.0m;

        decimal freight = minRate;
        if (chargeableWeight > minKg)
        {
            freight += Math.Round((chargeableWeight - minKg) * excessRate, 2);
        }

        decimal declaredValue = dto.DeclaredValue ?? 1000m;
        decimal valuationFee = Math.Round(declaredValue * valRate, 2);
        decimal fuelSurcharge = Math.Round(freight * fuelRate, 2);
        decimal computedAmount = freight + valuationFee + fuelSurcharge + odaRate;

        // Upsert Waybill in FOMS_DB
        var waybill = await _fomsDb.Waybills.FirstOrDefaultAsync(w => w.WaybillNumber == dto.WaybillNumber);
        if (waybill == null)
        {
            waybill = new Waybill
            {
                WaybillNumber = dto.WaybillNumber,
                ClientId = clientId,
                Origin = dto.Origin ?? "Manila Hub",
                Destination = dto.Destination ?? "Quezon City Hub",
                DeliveryArea = dto.DeliveryArea,
                ActualWeight = dto.ActualWeight,
                LengthCm = dto.LengthCm,
                WidthCm = dto.WidthCm,
                HeightCm = dto.HeightCm,
                NumberOfBoxes = dto.NumberOfBoxes ?? 1,
                DeclaredValue = declaredValue,
                DeliveryStatus = "Delivered",
                PodStatus = podStatus,
                IsBilled = false,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _fomsDb.Waybills.Add(waybill);
        }
        else
        {
            waybill.DeliveryStatus = "Delivered";
            waybill.PodStatus = podStatus;
            waybill.ActualWeight = dto.ActualWeight;
            waybill.DeliveryArea = dto.DeliveryArea;
            waybill.DeclaredValue = declaredValue;
            waybill.UpdatedAt = DateTime.UtcNow;
        }

        await _fomsDb.SaveChangesAsync();

        // Create / Update BillingDocument
        var billingDoc = await _fomsDb.BillingDocuments.FirstOrDefaultAsync(b => b.WaybillId == waybill.WaybillId);
        if (billingDoc == null)
        {
            billingDoc = new BillingDocument
            {
                WaybillId = waybill.WaybillId,
                ClientId = clientId,
                ComputedAmount = computedAmount,
                ValidationStatus = "Pending Review",
                CtcStatus = "Standard",
                CreatedAt = DateTime.UtcNow
            };
            _fomsDb.BillingDocuments.Add(billingDoc);
        }
        else
        {
            billingDoc.ComputedAmount = computedAmount;
            billingDoc.ValidationStatus = "Pending Review";
        }

        await _fomsDb.SaveChangesAsync();

        // Optional / Auto Invoice Generation & Accounts Receivable Recording (FR-015–020, FR-023)
        Invoice? createdInvoice = null;
        AccountsReceivable? createdAr = null;

        if (dto.AutoGenerateInvoice)
        {
            var nextInvoiceId = (await _fomsDb.Invoices.MaxAsync(i => (int?)i.InvoiceId) ?? 0) + 1;
            var invoiceNum = $"INV-{DateTime.UtcNow:yyyyMM}-{Guid.NewGuid().ToString("N")[..4].ToUpper()}";
            var invoiceStringId = $"INV-DMS-{nextInvoiceId:D4}";
            decimal vatAmount = Math.Round(computedAmount * 0.12m, 2);
            decimal totalAmount = computedAmount + vatAmount;
            var deliveryDate = dto.DeliveryDate ?? DateTime.UtcNow;
            var dueDate = DateOnly.FromDateTime(deliveryDate.AddDays(30)); // Standard 30-day term

            createdInvoice = new Invoice
            {
                Id = invoiceStringId,
                InvoiceId = nextInvoiceId,
                InvoiceNumber = invoiceNum,
                InvoiceNo = invoiceNum,
                ClientId = clientId,
                ClientName = clientName,
                BillingPeriod = $"{deliveryDate:yyyy-MM-01} to {deliveryDate:yyyy-MM-dd}",
                DueDate = dueDate,
                TotalAmount = totalAmount,
                PaidAmount = 0m,
                OutstandingBalance = totalAmount,
                InvoiceStatus = "Approved",
                ValidationStatus = "Validated",
                EncodedBy = "DMS Delivery Intake",
                UpdatedBy = "DMS Delivery Intake",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _fomsDb.Invoices.Add(createdInvoice);
            await _fomsDb.SaveChangesAsync();

            // Link waybill to invoice
            waybill.IsBilled = true;
            waybill.InvoiceId = createdInvoice.InvoiceId;
            waybill.InvoiceNo = createdInvoice.InvoiceNumber;

            // Invoice Line Item & Computation
            _fomsDb.InvoiceLineItems.Add(new InvoiceLineItem
            {
                InvoiceId = createdInvoice.InvoiceId,
                WaybillId = waybill.WaybillId,
                Description = $"Freight Delivery Charge - Waybill {waybill.WaybillNumber} ({dto.DeliveryArea})",
                Quantity = 1,
                UnitPrice = computedAmount,
                LineTotal = computedAmount,
                CreatedAt = DateTime.UtcNow
            });

            _fomsDb.InvoiceComputations.Add(new InvoiceComputation
            {
                InvoiceId = createdInvoice.InvoiceId,
                Subtotal = computedAmount,
                VatAmount = vatAmount,
                DiscountAmount = 0m,
                TotalAmount = totalAmount,
                ComputedAt = DateTime.UtcNow
            });

            // FR-023: Record Accounts Receivable
            createdAr = new AccountsReceivable
            {
                InvoiceId = createdInvoice.InvoiceId,
                ClientId = clientId,
                InvoiceAmount = totalAmount,
                PaidAmount = 0m,
                OutstandingBalance = totalAmount,
                OverpaymentAmount = 0m,
                RefundStatus = "None",
                ArStatus = "Unpaid",
                DueDate = dueDate,
                AgingBucket = "Current (0-30 days)",
                CollectionPriority = "Normal Priority",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _fomsDb.AccountsReceivable.Add(createdAr);

            await _fomsDb.SaveChangesAsync();
        }

        // Audit Trail Log
        _fomsDb.AuditLogs.Add(new AuditLog
        {
            role = "DMS Integration",
            action = "DMS_DELIVERY_COMPLETED",
            module = "DMS ↔ FOMS Billing",
            affected_record_id = waybill.WaybillId,
            remarks = $"DMS delivery completed for Waybill {dto.WaybillNumber}. Rate applied: ₱{computedAmount:N2}. " +
                      (createdInvoice != null ? $"Invoice {createdInvoice.InvoiceNumber} and Accounts Receivable recorded: ₱{createdInvoice.TotalAmount:N2}." : "BillingDocument created for review."),
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Processed DMS delivery-completed for waybill {WaybillNumber}: Computed ₱{ComputedAmount}", dto.WaybillNumber, computedAmount);

        return Ok(new
        {
            isSuccess = true,
            message = "DMS delivery intake processed successfully. Billing rate applied and AR recorded per FR-010, FR-011, FR-012, FR-023.",
            data = new
            {
                waybillNumber = waybill.WaybillNumber,
                waybillId = waybill.WaybillId,
                clientId = clientId,
                clientName = clientName,
                deliveryArea = waybill.DeliveryArea,
                actualWeight = waybill.ActualWeight,
                volumetricWeight = volWeight,
                chargeableWeight = chargeableWeight,
                breakdown = new
                {
                    freightCharges = freight,
                    valuationFee = valuationFee,
                    fuelSurcharge = fuelSurcharge,
                    odaRate = odaRate,
                    totalComputedAmount = computedAmount
                },
                podStatus = waybill.PodStatus,
                billingStatus = billingDoc.ValidationStatus,
                invoice = createdInvoice != null ? new
                {
                    invoiceId = createdInvoice.InvoiceId,
                    invoiceNumber = createdInvoice.InvoiceNumber,
                    dueDate = createdInvoice.DueDate?.ToString("yyyy-MM-dd"),
                    totalAmount = createdInvoice.TotalAmount,
                    status = createdInvoice.InvoiceStatus
                } : null,
                accountsReceivable = createdAr != null ? new
                {
                    arId = createdAr.ArId,
                    amount = createdAr.InvoiceAmount,
                    outstandingBalance = createdAr.OutstandingBalance,
                    status = createdAr.ArStatus,
                    agingBucket = createdAr.AgingBucket
                } : null
            }
        });
    }

    /// <summary>
    /// DMS ↔ FOMS Integration #2: Failed Delivery → Billing Hold.
    /// Driver marks Failed Delivery in DMS → DMS sends status/reason (FR-013) to place FOMS billing hold (FR-012, 013, 021).
    /// Prevents invoice computation and bundling until resolved.
    /// </summary>
    [HttpPost("delivery-failed")]
    [AllowAnonymous]
    public async Task<IActionResult> DeliveryFailed([FromBody] DmsDeliveryFailedDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.WaybillNumber))
            return BadRequest(new { isSuccess = false, message = "WaybillNumber is required" });

        var waybill = await _fomsDb.Waybills.FirstOrDefaultAsync(w => w.WaybillNumber == dto.WaybillNumber);
        if (waybill == null)
        {
            waybill = new Waybill
            {
                WaybillNumber = dto.WaybillNumber,
                ClientId = 1,
                Origin = "Manila Hub",
                Destination = "Customer Address",
                DeliveryArea = "NCR",
                DeliveryStatus = "Failed Delivery",
                PodStatus = "Hold - Failed Delivery",
                IsBilled = false,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _fomsDb.Waybills.Add(waybill);
        }
        else
        {
            waybill.DeliveryStatus = "Failed Delivery";
            waybill.PodStatus = "Hold - Failed Delivery";
            waybill.IsBilled = false;
            waybill.UpdatedAt = DateTime.UtcNow;
        }

        await _fomsDb.SaveChangesAsync();

        // FR-012, FR-013, FR-021: Place BillingDocument on Billing Hold
        var billingDoc = await _fomsDb.BillingDocuments.FirstOrDefaultAsync(b => b.WaybillId == waybill.WaybillId);
        if (billingDoc != null)
        {
            billingDoc.ValidationStatus = "On Hold - Delivery Failed";
        }
        else
        {
            _fomsDb.BillingDocuments.Add(new BillingDocument
            {
                WaybillId = waybill.WaybillId,
                ClientId = waybill.ClientId,
                ComputedAmount = 0m,
                ValidationStatus = "On Hold - Delivery Failed",
                CtcStatus = "Hold",
                CreatedAt = DateTime.UtcNow
            });
        }

        // Audit Trail Log
        _fomsDb.AuditLogs.Add(new AuditLog
        {
            role = "DMS Driver/Operations",
            action = "DMS_DELIVERY_FAILED_HOLD",
            module = "DMS ↔ FOMS Billing Hold",
            affected_record_id = waybill.WaybillId,
            remarks = $"Driver {dto.DriverName ?? "Courier"} marked delivery failed for Waybill {dto.WaybillNumber}. Reason: {dto.FailureReason}. Attempt #{dto.AttemptCount}. Billing Hold placed per FR-012, 013, 021.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogWarning("Placed billing hold on waybill {WaybillNumber} due to failed delivery: {Reason}", dto.WaybillNumber, dto.FailureReason);

        return Ok(new
        {
            isSuccess = true,
            message = $"Billing hold placed on Waybill {dto.WaybillNumber} per FR-012, 013, 021. Reason: {dto.FailureReason}.",
            data = new
            {
                waybillNumber = waybill.WaybillNumber,
                deliveryStatus = waybill.DeliveryStatus,
                podStatus = waybill.PodStatus,
                billingStatus = "On Hold - Delivery Failed",
                failureReason = dto.FailureReason,
                attemptCount = dto.AttemptCount,
                holdPlacedAt = DateTime.UtcNow
            }
        });
    }

    /// <summary>
    /// DMS ↔ FOMS Integration #2: Successful Re-Delivery Update.
    /// DMS sends updated Completed status + new POD → FOMS lifts hold and resumes invoice processing (FR-022).
    /// </summary>
    [HttpPost("redelivery-completed")]
    [AllowAnonymous]
    public async Task<IActionResult> RedeliveryCompleted([FromBody] DmsRedeliveryCompletedDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.WaybillNumber))
            return BadRequest(new { isSuccess = false, message = "WaybillNumber is required" });

        var waybill = await _fomsDb.Waybills.FirstOrDefaultAsync(w => w.WaybillNumber == dto.WaybillNumber);
        if (waybill == null)
            return NotFound(new { isSuccess = false, message = $"Waybill {dto.WaybillNumber} not found" });

        // FR-022: Lift Billing Hold & mark validated
        waybill.DeliveryStatus = "Delivered";
        waybill.PodStatus = "Validated";
        waybill.UpdatedAt = DateTime.UtcNow;

        // Resume invoice processing on BillingDocument
        var billingDoc = await _fomsDb.BillingDocuments.FirstOrDefaultAsync(b => b.WaybillId == waybill.WaybillId);
        if (billingDoc != null)
        {
            billingDoc.ValidationStatus = "Pending Review"; // Hold lifted
        }
        else
        {
            billingDoc = new BillingDocument
            {
                WaybillId = waybill.WaybillId,
                ClientId = waybill.ClientId,
                ComputedAmount = 150m,
                ValidationStatus = "Pending Review",
                CtcStatus = "Standard",
                CreatedAt = DateTime.UtcNow
            };
            _fomsDb.BillingDocuments.Add(billingDoc);
        }

        // Audit Trail Log
        _fomsDb.AuditLogs.Add(new AuditLog
        {
            role = "DMS Driver/Operations",
            action = "DMS_REDELIVERY_HOLD_LIFTED",
            module = "DMS ↔ FOMS Billing Hold",
            affected_record_id = waybill.WaybillId,
            remarks = $"Successful re-delivery for Waybill {dto.WaybillNumber} by {dto.DriverName ?? "Courier"}. New POD verified: {dto.PodUrl}. Billing hold lifted per FR-022, ready for invoicing.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Lifted billing hold on waybill {WaybillNumber} after successful re-delivery", dto.WaybillNumber);

        return Ok(new
        {
            isSuccess = true,
            message = $"Billing hold lifted for Waybill {dto.WaybillNumber} per FR-022. Waybill marked Validated and ready for invoicing.",
            data = new
            {
                waybillNumber = waybill.WaybillNumber,
                deliveryStatus = waybill.DeliveryStatus,
                podStatus = waybill.PodStatus,
                billingStatus = billingDoc.ValidationStatus,
                newPodUrl = dto.PodUrl,
                recipientName = dto.RecipientName,
                holdLiftedAt = DateTime.UtcNow
            }
        });
    }

    /// <summary>
    /// DMS ↔ FOMS Integration #3: Delivery Cash Advance Creation.
    /// Ops creates cash advance in DMS → sent to FOMS for finance review/approval (FR-050) prior to payout (FR-043, 044).
    /// </summary>
    [HttpPost("cash-advance")]
    [AllowAnonymous]
    public async Task<IActionResult> CreateCashAdvance([FromBody] DmsCashAdvanceDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.CourierName) || dto.AmountGiven <= 0)
            return BadRequest(new { isSuccess = false, message = "CourierName and positive AmountGiven are required." });

        var advanceId = !string.IsNullOrWhiteSpace(dto.AdvanceId)
            ? dto.AdvanceId
            : $"CA-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..4].ToUpper()}";

        var advance = new CashAdvance
        {
            AdvanceId = advanceId,
            CourierName = dto.CourierName,
            TripReference = dto.TripReference,
            AmountGiven = dto.AmountGiven,
            ReleaseDate = dto.ReleaseDate ?? DateTime.UtcNow,
            ReleasedBy = dto.ReleasedBy ?? "DMS Operations Dispatch",
            Status = "Pending Finance Review", // FR-050: Pending Finance review prior to payout
            Notes = dto.Purpose ?? dto.Notes ?? "DMS Operational Route Cash Advance",
            CreatedAt = DateTime.UtcNow
        };

        _fomsDb.CashAdvances.Add(advance);

        // Audit Trail
        _fomsDb.AuditLogs.Add(new AuditLog
        {
            role = "DMS Operations",
            action = "DMS_CASH_ADVANCE_RECEIVED",
            module = "DMS ↔ FOMS Cash Advance",
            remarks = $"DMS initiated Delivery Cash Advance {advanceId} for {dto.CourierName} ({dto.TripReference}): ₱{dto.AmountGiven:N2}. Awaiting Finance Review per FR-050.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Received DMS cash advance {AdvanceId} for courier {Courier}: ₱{Amount}", advanceId, dto.CourierName, dto.AmountGiven);

        return Ok(new
        {
            isSuccess = true,
            message = $"Cash advance {advanceId} submitted to FOMS for finance review/approval per FR-050.",
            data = advance
        });
    }

    /// <summary>
    /// DMS ↔ FOMS Integration #3: Post-trip Liquidation Submission.
    /// Post-trip liquidation + receipts submitted in DMS → FOMS validates and marks Pending Validation (FR-048–053).
    /// </summary>
    [HttpPost("liquidation")]
    [AllowAnonymous]
    public async Task<IActionResult> SubmitLiquidation([FromBody] DmsLiquidationDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.CashAdvanceId) || dto.TotalExpenses < 0)
            return BadRequest(new { isSuccess = false, message = "CashAdvanceId and non-negative TotalExpenses are required." });

        var refNum = !string.IsNullOrWhiteSpace(dto.ReferenceNumber)
            ? dto.ReferenceNumber
            : $"LIQ-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..4].ToUpper()}";

        // Check if cash advance exists
        var advance = await _fomsDb.CashAdvances.FirstOrDefaultAsync(a => a.AdvanceId == dto.CashAdvanceId);
        if (advance != null)
        {
            advance.Status = "Pending Liquidation";
        }

        var courierName = dto.SubmittedByName ?? dto.CourierName ?? advance?.CourierName ?? "Courier";

        // Calculate discrepancy: Advance amount vs total expenses
        decimal advanceAmount = advance?.AmountGiven ?? (dto.TotalExpenses + dto.LeftoverCash - dto.ReimbursementAmount);
        decimal leftover = dto.LeftoverCash;
        decimal reimbursement = dto.ReimbursementAmount;

        if (advanceAmount > dto.TotalExpenses && leftover == 0)
        {
            leftover = advanceAmount - dto.TotalExpenses;
        }
        else if (dto.TotalExpenses > advanceAmount && reimbursement == 0)
        {
            reimbursement = dto.TotalExpenses - advanceAmount;
        }

        var liquidation = new Liquidation
        {
            ReferenceNumber = refNum,
            SubmittedByName = courierName,
            TotalAmount = dto.TotalExpenses,
            LeftoverCash = leftover,
            ReimbursementAmount = reimbursement,
            Status = "Pending Validation", // FR-048–053: Ready for Finance review
            DateSubmitted = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            IsDeleted = false
        };

        _fomsDb.Liquidations.Add(liquidation);
        await _fomsDb.SaveChangesAsync();

        // Add line items
        if (dto.Expenses != null && dto.Expenses.Any())
        {
            foreach (var exp in dto.Expenses)
            {
                _fomsDb.LiquidationLineItems.Add(new LiquidationLineItem
                {
                    LiquidationId = liquidation.LiquidationId,
                    Description = exp.Description,
                    Amount = exp.Amount,
                    ReceiptAttached = !string.IsNullOrWhiteSpace(exp.ReceiptUrl),
                    CreatedAt = DateTime.UtcNow
                });
            }
        }
        else
        {
            // Default breakdown from trip expenses
            _fomsDb.LiquidationLineItems.Add(new LiquidationLineItem
            {
                LiquidationId = liquidation.LiquidationId,
                Description = $"Fuel & Toll Route Expenses - {dto.TripReference ?? advance?.TripReference ?? "Route"}",
                Amount = dto.TotalExpenses,
                ReceiptAttached = dto.DocumentUrls.Any(),
                CreatedAt = DateTime.UtcNow
            });
        }

        // Add documents / receipts
        foreach (var url in dto.DocumentUrls)
        {
            _fomsDb.LiquidationDocuments.Add(new LiquidationDocument
            {
                LiquidationId = liquidation.LiquidationId,
                DocumentType = "Receipt",
                FilePath = url,
                UploadedAt = DateTime.UtcNow
            });
        }

        // Audit Trail
        _fomsDb.AuditLogs.Add(new AuditLog
        {
            role = "DMS Operations",
            action = "DMS_LIQUIDATION_SUBMITTED",
            module = "DMS ↔ FOMS Liquidation",
            affected_record_id = liquidation.LiquidationId,
            remarks = $"DMS submitted post-trip liquidation {refNum} for Advance {dto.CashAdvanceId} ({courierName}): Total ₱{dto.TotalExpenses:N2}, Leftover: ₱{leftover:N2}, Reimbursement: ₱{reimbursement:N2}. Awaiting Validation per FR-048–053.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Processed DMS post-trip liquidation {RefNum} for advance {AdvanceId}", refNum, dto.CashAdvanceId);

        return Ok(new
        {
            isSuccess = true,
            message = $"Post-trip liquidation {refNum} submitted to FOMS and marked Pending Validation per FR-048–053.",
            data = new
            {
                liquidationId = liquidation.LiquidationId,
                referenceNumber = liquidation.ReferenceNumber,
                submittedBy = courierName,
                totalAmount = liquidation.TotalAmount,
                leftoverCash = liquidation.LeftoverCash,
                reimbursementAmount = liquidation.ReimbursementAmount,
                status = liquidation.Status,
                dateSubmitted = liquidation.DateSubmitted
            }
        });
using Microsoft.Extensions.Options;
using FOMS.Application.Configuration;
using FOMS.Application.Contracts;
using FOMS.Application.Interfaces;
using FOMS.Infrastructure.Services;

namespace FOMS.Api.Controllers;

[ApiController]
public class DmsIntegrationController : ControllerBase
{
    private readonly IDmsIntegrationService _dmsService;
    private readonly DmsIntegrationOptions _options;

    public DmsIntegrationController(
        IDmsIntegrationService dmsService,
        IOptions<DmsIntegrationOptions> options)
    {
        _dmsService = dmsService;
        _options = options.Value;
    }

    private IActionResult? ValidateApiKey()
    {
        if (string.IsNullOrWhiteSpace(_options.InboundApiKey))
            return StatusCode(503, new { message = "DMS integration is not configured on this server." });

        var key = Request.Headers[DmsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        return DmsIntegrationService.ValidateApiKey(key, _options.InboundApiKey)
            ? null
            : Unauthorized(new { message = "Invalid or missing API key." });
    }

    /// <summary>
    /// Integration 1 (DMS → FOMS): Delivery marked Completed after POD validation.
    /// Creates waybill, validates POD, calculates billing, creates Invoice, and records AR.
    /// </summary>
    [HttpPost("api/integration/dms/delivery-completed")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveDeliveryCompleted([FromBody] DmsDeliveryCompletedDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessDeliveryCompletedAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 2 (DMS → FOMS - Trigger A): Driver records a failed delivery in DMS.
    /// Places a Billing Hold in FOMS preventing invoice creation per FR-013.
    /// </summary>
    [HttpPost("api/integration/dms/delivery-failed")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveDeliveryFailed([FromBody] DmsDeliveryFailedDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessDeliveryFailedAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 2 (DMS → FOMS - Trigger B): Successful redelivery update.
    /// Lifts Billing Hold in FOMS and resumes invoice processing per FR-022.
    /// </summary>
    [HttpPost("api/integration/dms/delivery-redelivered")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveRedeliveryCompleted([FromBody] DmsRedeliveryCompletedDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessRedeliveryCompletedAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 3 (DMS → FOMS - Trigger A): Operations Team requests a trip cash advance.
    /// Finance approves and records cash outflow per FR-043/050.
    /// </summary>
    [HttpPost("api/integration/dms/cash-advance-request")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveCashAdvanceRequest([FromBody] DmsCashAdvanceRequestDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessCashAdvanceRequestAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 3 (DMS → FOMS - Trigger B): Operations Team submits post-trip liquidation & receipts.
    /// FOMS validates receipts, reconciles leftover cash, and marks liquidated per FR-048–053.
    /// </summary>
    [HttpPost("api/integration/dms/liquidation-submission")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveLiquidationSubmission([FromBody] DmsLiquidationSubmissionDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessLiquidationSubmissionAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Look up waybill status, POD, and billing details.
    /// </summary>
    [HttpGet("api/integration/dms/waybills/{waybillNo}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetWaybillStatus(string waybillNo)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var result = await _dmsService.GetWaybillStatusAsync(waybillNo);
        return result != null ? Ok(result) : NotFound(new { message = $"Waybill '{waybillNo}' not found in FOMS." });
    }
}
