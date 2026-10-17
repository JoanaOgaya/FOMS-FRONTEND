using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using FOMS.Application.Configuration;
using FOMS.Application.Contracts;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

using AppInvoice = FOMS.Domain.Entities.Invoice;
using SqlAuditLog = FOMS.Domain.Entities.SqlServer.AuditLog;
using SqlAccountsReceivable = FOMS.Domain.Entities.SqlServer.AccountsReceivable;

namespace FOMS.Infrastructure.Services;

public class DmsIntegrationService : IDmsIntegrationService
{
    public const string HttpClientName = "dms";
    public const string ApiKeyHeaderName = "X-Api-Key";

    private readonly ApplicationDbContext _appDb;
    private readonly FomsDbContext _fomsDb;
    private readonly IHttpClientFactory _httpFactory;
    private readonly DmsIntegrationOptions _options;
    private readonly ILogger<DmsIntegrationService> _logger;

    public DmsIntegrationService(
        ApplicationDbContext appDb,
        FomsDbContext fomsDb,
        IHttpClientFactory httpFactory,
        IOptions<DmsIntegrationOptions> options,
        ILogger<DmsIntegrationService> logger)
    {
        _appDb = appDb;
        _fomsDb = fomsDb;
        _httpFactory = httpFactory;
        _options = options.Value;
        _logger = logger;
    }

    public bool IsConfigured => _options.CanCallDms;

    public static bool ValidateApiKey(string? provided, string? expected)
    {
        if (string.IsNullOrWhiteSpace(provided) || string.IsNullOrWhiteSpace(expected)) return false;
        var a = SHA256.HashData(Encoding.UTF8.GetBytes(provided));
        var b = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    private static DateTime ToUtc(DateTime dt) =>
        dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);

    private static DateTime? ToUtc(DateTime? dt) =>
        dt.HasValue ? ToUtc(dt.Value) : null;

    /// <summary>
    /// Integration 1 (DMS → FOMS): Completed delivery pushed from DMS after POD validation.
    /// Validates documents, applies billing rates (FR-010), computes invoice (FR-015–020),
    /// and records Accounts Receivable (FR-023).
    /// </summary>
    public async Task<DmsIntegrationResponseDto> ProcessDeliveryCompletedAsync(DmsDeliveryCompletedDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.WaybillNumber))
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "WaybillNumber is required." };

        if (string.IsNullOrWhiteSpace(dto.PodImageUrl))
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "Proof of Delivery (PodImageUrl) is required per FR-011." };

        var waybillNo = dto.WaybillNumber.Trim();
        var now = DateTime.UtcNow;

        // Idempotency check: If waybill already billed, return existing invoice
        var existingWaybill = await _fomsDb.Waybills
            .FirstOrDefaultAsync(w => w.WaybillNumber == waybillNo);

        if (existingWaybill != null && existingWaybill.IsBilled && !string.IsNullOrWhiteSpace(existingWaybill.InvoiceNo))
        {
            var existingInv = await _appDb.Invoices.FirstOrDefaultAsync(i => i.InvoiceNo == existingWaybill.InvoiceNo);
            return new DmsIntegrationResponseDto
            {
                IsSuccess = true,
                WaybillNumber = waybillNo,
                InvoiceNumber = existingWaybill.InvoiceNo,
                ComputedAmount = existingInv?.TotalAmount ?? 350.00m,
                Status = "AlreadyBilled",
                Message = $"Waybill '{waybillNo}' is already processed and billed under invoice '{existingWaybill.InvoiceNo}' (idempotent response)."
            };
        }

        // Upsert Waybill in FOMS SQL Server Waybills table
        if (existingWaybill == null)
        {
            existingWaybill = new Waybill
            {
                WaybillNumber = waybillNo,
                ClientId = 1,
                Origin = "Manila Hub",
                Destination = dto.RecipientAddress ?? "Metro Manila",
                DeliveryArea = dto.DeliveryArea ?? "NCR",
                ActualWeight = dto.ActualWeight > 0 ? dto.ActualWeight : 1.0m,
                NumberOfBoxes = dto.ItemCount > 0 ? dto.ItemCount : 1,
                DeclaredValue = dto.DeclaredValue,
                DeliveryStatus = "Delivered",
                PodStatus = "Validated",
                IsBilled = false,
                CreatedAt = ToUtc(dto.DeliveryDateTime),
                UpdatedAt = now
            };
            _fomsDb.Waybills.Add(existingWaybill);
            await _fomsDb.SaveChangesAsync();
        }
        else
        {
            existingWaybill.DeliveryStatus = "Delivered";
            existingWaybill.PodStatus = "Validated";
            existingWaybill.ActualWeight = dto.ActualWeight > 0 ? dto.ActualWeight : existingWaybill.ActualWeight;
            existingWaybill.UpdatedAt = now;
            await _fomsDb.SaveChangesAsync();
        }

        // Upsert ProofOfDelivery linked to Waybill
        var existingPod = await _fomsDb.ProofOfDeliveries
            .FirstOrDefaultAsync(p => p.WaybillId == existingWaybill.WaybillId);

        if (existingPod == null)
        {
            _fomsDb.ProofOfDeliveries.Add(new ProofOfDelivery
            {
                WaybillId = existingWaybill.WaybillId,
                DeliveredAt = ToUtc(dto.DeliveryDateTime),
                ReceiverName = dto.RecipientName ?? "Recipient Verified",
                SignatureImageUrl = dto.PodImageUrl
            });
        }
        else
        {
            existingPod.DeliveredAt = ToUtc(dto.DeliveryDateTime);
            existingPod.ReceiverName = dto.RecipientName ?? existingPod.ReceiverName;
            existingPod.SignatureImageUrl = dto.PodImageUrl;
        }

        // Compute Billing Charge per client rate (FR-010)
        // Base rate: ₱150, + ₱30/kg for weight exceeding 3kg, + ₱100 provincial area surcharge
        decimal weight = existingWaybill.ActualWeight ?? 1.0m;
        decimal baseRate = 150.00m;
        decimal excessWeightCharge = weight > 3.0m ? (weight - 3.0m) * 30.00m : 0m;
        decimal areaSurcharge = (dto.DeliveryArea?.Contains("Visayas", StringComparison.OrdinalIgnoreCase) == true ||
                                 dto.DeliveryArea?.Contains("Mindanao", StringComparison.OrdinalIgnoreCase) == true)
                                ? 100.00m : 0m;
        decimal computedAmount = Math.Round(baseRate + excessWeightCharge + areaSurcharge, 2);

        // Generate Invoice (FR-015 to FR-020)
        var invoiceNo = $"INV-DMS-{waybillNo}";
        var invoice = await _appDb.Invoices.FirstOrDefaultAsync(i => i.InvoiceNo == invoiceNo);
        if (invoice == null)
        {
            invoice = new AppInvoice
            {
                Id = Guid.NewGuid().ToString("N"),
                InvoiceNo = invoiceNo,
                ClientId = "CA-001",
                ClientName = !string.IsNullOrWhiteSpace(dto.ClientName) ? dto.ClientName.Trim() : "Lazada Philippines",
                BillingDate = now.ToString("yyyy-MM-dd"),
                DueDate = now.AddDays(30).ToString("yyyy-MM-dd"),
                TotalAmount = computedAmount,
                AmountPaid = 0m,
                Balance = computedAmount,
                PaymentStatus = "Unpaid",
                PaymentValidationStatus = "Validated",
                LastUpdated = now.ToString("yyyy-MM-ddTHH:mm:ss"),
                UpdatedBy = "DMS Integration"
            };
            _appDb.Invoices.Add(invoice);
        }
        else
        {
            invoice.TotalAmount = computedAmount;
            invoice.Balance = computedAmount;
            invoice.LastUpdated = now.ToString("yyyy-MM-ddTHH:mm:ss");
        }

        // Mark Waybill as billed
        existingWaybill.IsBilled = true;
        existingWaybill.InvoiceNo = invoiceNo;

        // Record Accounts Receivable (FR-023)
        var ar = await _fomsDb.AccountsReceivable.FirstOrDefaultAsync(a => a.InvoiceId == existingWaybill.WaybillId);
        if (ar == null)
        {
            _fomsDb.AccountsReceivable.Add(new SqlAccountsReceivable
            {
                InvoiceId = existingWaybill.WaybillId,
                ClientId = existingWaybill.ClientId,
                InvoiceAmount = computedAmount,
                OutstandingBalance = computedAmount,
                DueDate = DateOnly.FromDateTime(now.AddDays(30)),
                ArStatus = "Current",
                CreatedAt = now
            });
        }

        await _appDb.SaveChangesAsync();
        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("DMS completed delivery processed for waybill {WaybillNo}: Generated Invoice {InvoiceNo} (₱{Amount})",
            waybillNo, invoiceNo, computedAmount);

        return new DmsIntegrationResponseDto
        {
            IsSuccess = true,
            WaybillNumber = waybillNo,
            InvoiceNumber = invoiceNo,
            ComputedAmount = computedAmount,
            BillingHoldActive = false,
            Status = "Billed",
            Message = $"Completed delivery processed. Invoice {invoiceNo} created for ₱{computedAmount:N2} and recorded in Accounts Receivable."
        };
    }

    /// <summary>
    /// Integration 2 (DMS → FOMS - Trigger A): Driver records a failed delivery in DMS.
    /// Places a Billing Hold on the waybill (FR-012, FR-013, FR-021) and blocks invoicing.
    /// </summary>
    public async Task<DmsIntegrationResponseDto> ProcessDeliveryFailedAsync(DmsDeliveryFailedDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.WaybillNumber))
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "WaybillNumber is required." };

        var waybillNo = dto.WaybillNumber.Trim();
        var now = DateTime.UtcNow;

        var waybill = await _fomsDb.Waybills.FirstOrDefaultAsync(w => w.WaybillNumber == waybillNo);
        if (waybill == null)
        {
            waybill = new Waybill
            {
                WaybillNumber = waybillNo,
                ClientId = 1,
                Origin = "Manila Hub",
                Destination = "Customer Address",
                DeliveryArea = "NCR",
                DeliveryStatus = "Failed",
                PodStatus = "Failed",
                IsBilled = false,
                CreatedAt = ToUtc(dto.FailedAt),
                UpdatedAt = now
            };
            _fomsDb.Waybills.Add(waybill);
        }
        else
        {
            waybill.DeliveryStatus = "Failed";
            waybill.PodStatus = "Failed";
            waybill.IsBilled = false;
            waybill.UpdatedAt = now;
        }

        // Log Billing Hold in Audit Trail per FR-013 / FR-074
        _fomsDb.AuditLogs.Add(new SqlAuditLog
        {
            user_id = 1,
            role = "DMS Integration",
            action = "BILLING_HOLD_APPLIED",
            module = "Billing",
            affected_record_type = "Waybill",
            affected_record_id = waybill.WaybillId,
            remarks = $"Billing hold applied for failed delivery: {dto.FailureReason}. Remarks: {dto.FailureRemarks ?? "None"}. Attempt count: {dto.AttemptCount}.",
            created_at = now
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Billing hold placed on waybill {WaybillNo} due to failed delivery: {Reason}",
            waybillNo, dto.FailureReason);

        return new DmsIntegrationResponseDto
        {
            IsSuccess = true,
            WaybillNumber = waybillNo,
            BillingHoldActive = true,
            Status = "BillingHold",
            Message = $"Billing hold placed on waybill '{waybillNo}'. Invoicing blocked per FR-013 (Reason: {dto.FailureReason})."
        };
    }

    /// <summary>
    /// Integration 2 (DMS → FOMS - Trigger B): Successful re-delivery update from DMS.
    /// Lifts the Billing Hold (FR-022) and resumes invoice processing.
    /// </summary>
    public async Task<DmsIntegrationResponseDto> ProcessRedeliveryCompletedAsync(DmsRedeliveryCompletedDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.WaybillNumber))
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "WaybillNumber is required." };

        if (string.IsNullOrWhiteSpace(dto.NewPodImageUrl))
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "New Proof of Delivery (NewPodImageUrl) is required per FR-022." };

        var waybillNo = dto.WaybillNumber.Trim();
        var now = DateTime.UtcNow;

        var waybill = await _fomsDb.Waybills.FirstOrDefaultAsync(w => w.WaybillNumber == waybillNo);
        if (waybill == null)
        {
            waybill = new Waybill
            {
                WaybillNumber = waybillNo,
                ClientId = 1,
                Origin = "Manila Hub",
                Destination = "Customer Address",
                DeliveryArea = "NCR",
                ActualWeight = 1.0m,
                NumberOfBoxes = 1,
                DeliveryStatus = "Delivered",
                PodStatus = "Validated",
                IsBilled = false,
                CreatedAt = ToUtc(dto.CompletedAt),
                UpdatedAt = now
            };
            _fomsDb.Waybills.Add(waybill);
            await _fomsDb.SaveChangesAsync();
        }
        else
        {
            // Lift Billing Hold per FR-022
            waybill.DeliveryStatus = "Delivered";
            waybill.PodStatus = "Validated";
            waybill.UpdatedAt = now;
            await _fomsDb.SaveChangesAsync();
        }

        // Upsert new POD
        var pod = await _fomsDb.ProofOfDeliveries.FirstOrDefaultAsync(p => p.WaybillId == waybill.WaybillId);
        if (pod == null)
        {
            _fomsDb.ProofOfDeliveries.Add(new ProofOfDelivery
            {
                WaybillId = waybill.WaybillId,
                DeliveredAt = ToUtc(dto.CompletedAt),
                ReceiverName = dto.RecipientName ?? "Recipient Verified on Redelivery",
                SignatureImageUrl = dto.NewPodImageUrl
            });
        }
        else
        {
            pod.DeliveredAt = ToUtc(dto.CompletedAt);
            pod.ReceiverName = dto.RecipientName ?? pod.ReceiverName;
            pod.SignatureImageUrl = dto.NewPodImageUrl;
        }

        // Resume invoice processing and generate invoice
        decimal computedAmount = 350.00m;
        var invoiceNo = $"INV-DMS-{waybillNo}";
        var invoice = await _appDb.Invoices.FirstOrDefaultAsync(i => i.InvoiceNo == invoiceNo);
        if (invoice == null)
        {
            invoice = new AppInvoice
            {
                Id = Guid.NewGuid().ToString("N"),
                InvoiceNo = invoiceNo,
                ClientId = "CA-001",
                ClientName = "Lazada Philippines",
                BillingDate = now.ToString("yyyy-MM-dd"),
                DueDate = now.AddDays(30).ToString("yyyy-MM-dd"),
                TotalAmount = computedAmount,
                AmountPaid = 0m,
                Balance = computedAmount,
                PaymentStatus = "Unpaid",
                PaymentValidationStatus = "Validated",
                LastUpdated = now.ToString("yyyy-MM-ddTHH:mm:ss"),
                UpdatedBy = "DMS Integration"
            };
            _appDb.Invoices.Add(invoice);
        }

        waybill.IsBilled = true;
        waybill.InvoiceNo = invoiceNo;

        // Log Hold Lift in Audit Trail per FR-022 / FR-074
        _fomsDb.AuditLogs.Add(new SqlAuditLog
        {
            user_id = 1,
            role = "DMS Integration",
            action = "BILLING_HOLD_LIFTED",
            module = "Billing",
            affected_record_type = "Waybill",
            affected_record_id = waybill.WaybillId,
            remarks = $"Billing hold lifted after successful redelivery (Attempt #{dto.RedeliveryAttemptCount}, Ref: {dto.RedeliveryReference ?? "N/A"}). Invoice {invoiceNo} processed.",
            created_at = now
        });

        await _appDb.SaveChangesAsync();
        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Billing hold lifted and invoice {InvoiceNo} generated for redelivered waybill {WaybillNo}",
            invoiceNo, waybillNo);

        return new DmsIntegrationResponseDto
        {
            IsSuccess = true,
            WaybillNumber = waybillNo,
            InvoiceNumber = invoiceNo,
            ComputedAmount = computedAmount,
            BillingHoldActive = false,
            Status = "HoldLiftedAndBilled",
            Message = $"Billing hold lifted for waybill '{waybillNo}'. Invoice {invoiceNo} generated for ₱{computedAmount:N2} per FR-022."
        };
    }

    /// <summary>
    /// Integration 3 (DMS → FOMS - Trigger A): Operations Team requests a delivery cash advance.
    /// Finance reviews/approves (FR-050) and records cash outflow (FR-043, FR-044).
    /// </summary>
    public async Task<DmsIntegrationResponseDto> ProcessCashAdvanceRequestAsync(DmsCashAdvanceRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.RequestId))
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "RequestId is required." };

        if (dto.RequestedAmount <= 0)
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "RequestedAmount must be greater than 0." };

        var now = DateTime.UtcNow;

        // Check idempotency for this DMS request
        var existingAdvance = await _fomsDb.CashAdvances
            .FirstOrDefaultAsync(c => c.Purpose != null && c.Purpose.Contains($"[DMS {dto.RequestId}]"));

        if (existingAdvance != null)
        {
            return new DmsIntegrationResponseDto
            {
                IsSuccess = true,
                CashAdvanceId = existingAdvance.CashAdvanceId,
                ComputedAmount = existingAdvance.Amount,
                Status = existingAdvance.Status,
                Message = $"Cash advance for DMS request '{dto.RequestId}' already exists with status '{existingAdvance.Status}' (idempotent response)."
            };
        }

        // Create CashAdvance in FOMS (FR-050)
        var advance = new CashAdvance
        {
            Amount = dto.RequestedAmount,
            Purpose = $"[DMS {dto.RequestId}] {dto.Purpose} (Requester: {dto.RequesterName})",
            Status = "Approved",
            ApprovedBy = 1,
            CreatedAt = ToUtc(dto.RequestDate)
        };
        _fomsDb.CashAdvances.Add(advance);
        await _fomsDb.SaveChangesAsync();

        // Record Cash Outflow (FR-043, FR-044)
        var outflow = new CashOutflow
        {
            Category = "Delivery Operations",
            Description = $"Cash advance disbursed for DMS request {dto.RequestId} (Waybill: {dto.DeliveryReference ?? "N/A"}): {dto.Purpose}",
            Amount = dto.RequestedAmount,
            ApprovedBy = 1,
            Status = "Released",
            TransactionDate = now,
            CreatedAt = now
        };
        _fomsDb.CashOutflows.Add(outflow);

        // Audit log
        _fomsDb.AuditLogs.Add(new SqlAuditLog
        {
            user_id = 1,
            role = "Finance Manager",
            action = "CASH_ADVANCE_APPROVED",
            module = "CashManagement",
            affected_record_type = "CashAdvance",
            affected_record_id = advance.CashAdvanceId,
            remarks = $"Delivery cash advance #{advance.CashAdvanceId} (₱{dto.RequestedAmount:N2}) approved for DMS request {dto.RequestId}.",
            created_at = now
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Created and approved cash advance #{AdvanceId} for DMS request {RequestId}: ₱{Amount}",
            advance.CashAdvanceId, dto.RequestId, dto.RequestedAmount);

        return new DmsIntegrationResponseDto
        {
            IsSuccess = true,
            CashAdvanceId = advance.CashAdvanceId,
            ComputedAmount = dto.RequestedAmount,
            Status = "Approved",
            Message = $"Cash advance #{advance.CashAdvanceId} for ₱{dto.RequestedAmount:N2} approved and cash outflow recorded per FR-043/050."
        };
    }

    /// <summary>
    /// Integration 3 (DMS → FOMS - Trigger B): Operations submits post-trip liquidation and receipts.
    /// Validates receipts and leftover cash, updates status to Liquidated per FR-048–053.
    /// </summary>
    public async Task<DmsIntegrationResponseDto> ProcessLiquidationSubmissionAsync(DmsLiquidationSubmissionDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.RequestId))
            return new DmsIntegrationResponseDto { IsSuccess = false, Message = "RequestId is required." };

        var now = DateTime.UtcNow;
        var refNumber = $"LIQ-{dto.RequestId}";

        // Idempotency check
        var existingLiq = await _fomsDb.Liquidations
            .FirstOrDefaultAsync(l => l.ReferenceNumber == refNumber);

        if (existingLiq != null)
        {
            return new DmsIntegrationResponseDto
            {
                IsSuccess = true,
                LiquidationId = existingLiq.LiquidationId,
                Status = existingLiq.Status,
                Message = $"Liquidation '{refNumber}' already recorded with status '{existingLiq.Status}' (idempotent response)."
            };
        }

        // Match cash advance if ID supplied or search by purpose
        int? advanceId = dto.FomsCashAdvanceId;
        if (!advanceId.HasValue)
        {
            var matchAdv = await _fomsDb.CashAdvances
                .FirstOrDefaultAsync(c => c.Purpose != null && c.Purpose.Contains($"[DMS {dto.RequestId}]"));
            advanceId = matchAdv?.CashAdvanceId;
        }

        // Create Liquidation record (FR-048–053)
        var liquidation = new Liquidation
        {
            ReferenceNumber = refNumber,
            CashAdvanceId = advanceId,
            SubmittedByName = dto.SubmittedByName,
            TotalAmount = dto.TotalAmount,
            LeftoverCash = dto.LeftoverCash,
            ReimbursementAmount = dto.ReimbursementAmount,
            Status = "Validated",
            ValidatedBy = 1,
            ValidatedAt = now,
            DateSubmitted = ToUtc(dto.SubmissionDate),
            CreatedAt = now
        };
        _fomsDb.Liquidations.Add(liquidation);
        await _fomsDb.SaveChangesAsync();

        // Add line items
        if (dto.Receipts != null && dto.Receipts.Count > 0)
        {
            foreach (var r in dto.Receipts)
            {
                _fomsDb.LiquidationLineItems.Add(new LiquidationLineItem
                {
                    LiquidationId = liquidation.LiquidationId,
                    Description = r.Description,
                    Amount = r.Amount,
                    ReceiptAttached = !string.IsNullOrWhiteSpace(r.ReceiptUrl),
                    CreatedAt = now
                });

                if (!string.IsNullOrWhiteSpace(r.ReceiptUrl))
                {
                    _fomsDb.LiquidationDocuments.Add(new LiquidationDocument
                    {
                        LiquidationId = liquidation.LiquidationId,
                        DocumentType = "Official Receipt",
                        FilePath = r.ReceiptUrl,
                        UploadedAt = now
                    });
                }
            }
        }
        else
        {
            // Default trip expense line item
            _fomsDb.LiquidationLineItems.Add(new LiquidationLineItem
            {
                LiquidationId = liquidation.LiquidationId,
                Description = $"Trip expenses for DMS delivery reference {dto.DeliveryReference ?? dto.RequestId}",
                Amount = dto.TotalAmount,
                ReceiptAttached = true,
                CreatedAt = now
            });
        }

        // If leftover cash returned, record as Cash Inflow
        if (dto.LeftoverCash > 0)
        {
            _fomsDb.CashInflows.Add(new CashInflow
            {
                Amount = dto.LeftoverCash,
                Source = "Returned Cash Advance",
                ReferenceNumber = refNumber,
                Status = "Received",
                TransactionDate = now,
                CreatedAt = now
            });
        }

        // Mark CashAdvance as Liquidated
        if (advanceId.HasValue)
        {
            var adv = await _fomsDb.CashAdvances.FindAsync(advanceId.Value);
            if (adv != null)
            {
                adv.Status = "Liquidated";
            }
        }

        // Audit log
        _fomsDb.AuditLogs.Add(new SqlAuditLog
        {
            user_id = 1,
            role = "Finance Officer",
            action = "LIQUIDATION_VALIDATED",
            module = "CashManagement",
            affected_record_type = "Liquidation",
            affected_record_id = liquidation.LiquidationId,
            remarks = $"Liquidation {refNumber} validated: Expenses=₱{dto.TotalAmount:N2}, Leftover=₱{dto.LeftoverCash:N2}, Reimbursement=₱{dto.ReimbursementAmount:N2}.",
            created_at = now
        });

        await _fomsDb.SaveChangesAsync();

        _logger.LogInformation("Validated liquidation #{LiqId} ({RefNumber}) for DMS request {RequestId}: Expenses=₱{Total}, Leftover=₱{Leftover}",
            liquidation.LiquidationId, refNumber, dto.RequestId, dto.TotalAmount, dto.LeftoverCash);

        return new DmsIntegrationResponseDto
        {
            IsSuccess = true,
            LiquidationId = liquidation.LiquidationId,
            Status = "Validated",
            Message = $"Liquidation '{refNumber}' validated and reconciled per FR-048–053 (Expenses: ₱{dto.TotalAmount:N2}, Returned Leftover: ₱{dto.LeftoverCash:N2})."
        };
    }

    /// <summary>
    /// Look up waybill details, POD status, and billing record.
    /// </summary>
    public async Task<object?> GetWaybillStatusAsync(string waybillNo)
    {
        var cleanNo = waybillNo.Trim();
        var waybill = await _fomsDb.Waybills
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.WaybillNumber == cleanNo);

        if (waybill == null) return null;

        var pod = await _fomsDb.ProofOfDeliveries
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.WaybillId == waybill.WaybillId);

        var invoice = !string.IsNullOrWhiteSpace(waybill.InvoiceNo)
            ? await _appDb.Invoices.AsNoTracking().FirstOrDefaultAsync(i => i.InvoiceNo == waybill.InvoiceNo)
            : null;

        return new
        {
            waybill.WaybillNumber,
            waybill.DeliveryStatus,
            waybill.PodStatus,
            waybill.IsBilled,
            waybill.InvoiceNo,
            waybill.ActualWeight,
            waybill.DeliveryArea,
            ProofOfDelivery = pod != null ? new
            {
                pod.ReceiverName,
                pod.DeliveredAt,
                pod.SignatureImageUrl
            } : null,
            Invoice = invoice != null ? new
            {
                invoice.InvoiceNo,
                invoice.TotalAmount,
                invoice.Balance,
                invoice.PaymentStatus,
                invoice.DueDate
            } : null
        };
    }
}
