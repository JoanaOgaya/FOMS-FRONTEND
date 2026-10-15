using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/financial-manager")]
[Route("financial-manager")]
public class FinancialManagerController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public FinancialManagerController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    private bool IsAuthorizedFinancialManager()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value
                ?? User.FindFirst("role")?.Value;

        if (string.IsNullOrEmpty(role)) return true; // dev fallback if authenticated

        return string.Equals(role, "Financial Manager", StringComparison.OrdinalIgnoreCase)
            || string.Equals(role, "Finance Manager", StringComparison.OrdinalIgnoreCase)
            || string.Equals(role, "System Admin", StringComparison.OrdinalIgnoreCase);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Executive Dashboard
    // GET /api/financial-manager/dashboard
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        if (!IsAuthorizedFinancialManager())
            return StatusCode(403, new { success = false, message = "Access denied. Financial Manager role required." });

        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
        var arList = await _fomsDb.AccountsReceivable.AsNoTracking().ToListAsync();
        var payments = await _fomsDb.Payments.AsNoTracking().ToListAsync();
        var inflows = await _fomsDb.CashInflows.AsNoTracking().ToListAsync();
        var outflows = await _fomsDb.CashOutflows.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();
        var aiReviews = await _fomsDb.AIReviewHistories.AsNoTracking().ToListAsync();

        var totalInvoicesBilled = invoices.Count;
        var totalInvoiceAmount = invoices.Sum(i => i.TotalAmount);
        var totalArOutstanding = arList.Sum(a => a.OutstandingBalance ?? 0m);
        if (totalArOutstanding == 0 && invoices.Any())
        {
            totalArOutstanding = invoices.Sum(i => i.OutstandingBalance ?? (i.TotalAmount - (i.PaidAmount ?? 0m)));
        }

        var totalPaid = invoices.Sum(i => i.PaidAmount ?? 0m);
        if (totalPaid == 0 && payments.Any(p => p.PaymentStatus == "Validated" || p.PaymentStatus == "Paid"))
        {
            totalPaid = payments.Where(p => p.PaymentStatus == "Validated" || p.PaymentStatus == "Paid").Sum(p => p.Amount);
        }
        var collectionRate = totalInvoiceAmount > 0
            ? Math.Round((double)((totalPaid / totalInvoiceAmount) * 100), 1)
            : 0.0;

        var now = DateTime.UtcNow;
        var cashInflowThisMonth = inflows
            .Where(ci => ci.TransactionDate.HasValue && ci.TransactionDate.Value.Month == now.Month && ci.TransactionDate.Value.Year == now.Year)
            .Sum(ci => ci.Amount);

        if (cashInflowThisMonth == 0)
        {
            cashInflowThisMonth = payments
                .Where(p => (p.PaymentStatus == "Validated" || p.PaymentStatus == "Paid")
                         && ((p.ValidatedAt.HasValue && p.ValidatedAt.Value.Month == now.Month && p.ValidatedAt.Value.Year == now.Year)
                          || (p.SubmittedAt.HasValue && p.SubmittedAt.Value.Month == now.Month && p.SubmittedAt.Value.Year == now.Year)))
                .Sum(p => p.Amount);
        }

        var duplicateAlerts = aiReviews.Count(r => r.FinalDecision == "Duplicate" || r.FinalDecision == "Flagged");

        var todayDateOnly = DateOnly.FromDateTime(now);
        var sevenDaysLater = todayDateOnly.AddDays(7);
        var accountsNearDueDate = arList.Count(a => a.DueDate.HasValue && a.DueDate.Value >= todayDateOnly && a.DueDate.Value <= sevenDaysLater && (a.OutstandingBalance ?? 0) > 0);
        if (accountsNearDueDate == 0)
        {
            accountsNearDueDate = invoices.Count(i => i.DueDate.HasValue && i.DueDate.Value >= todayDateOnly && i.DueDate.Value <= sevenDaysLater && (i.OutstandingBalance ?? 0) > 0);
        }

        var cashFlowAnalytics = new List<object>();
        for (int m = 5; m >= 0; m--)
        {
            var targetMonth = now.AddMonths(-m);
            var mInflow = inflows.Where(ci => ci.TransactionDate.HasValue && ci.TransactionDate.Value.Month == targetMonth.Month && ci.TransactionDate.Value.Year == targetMonth.Year).Sum(ci => ci.Amount);
            var mOutflow = outflows.Where(co => co.TransactionDate.HasValue && co.TransactionDate.Value.Month == targetMonth.Month && co.TransactionDate.Value.Year == targetMonth.Year).Sum(co => co.Amount);
            cashFlowAnalytics.Add(new
            {
                period = targetMonth.ToString("MMM yyyy"),
                inflow = mInflow,
                outflow = mOutflow,
                net = mInflow - mOutflow
            });
        }

        var topPayingClients = clients.Select(c =>
        {
            var paid = payments.Where(p => p.ClientId == c.ClientId && (p.PaymentStatus == "Validated" || p.PaymentStatus == "Paid")).Sum(p => p.Amount);
            return new
            {
                clientId = c.ClientId,
                clientName = c.CompanyName,
                amount = paid
            };
        }).Where(x => x.amount > 0).OrderByDescending(x => x.amount).Take(5).ToList();

        var needsAttention = new List<object>();
        var pendingInvoices = invoices.Where(i => i.InvoiceStatus == "Pending Validation" || i.InvoiceStatus == "For Review").ToList();
        foreach (var inv in pendingInvoices)
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == inv.ClientId);
            needsAttention.Add(new
            {
                type = "Invoice",
                id = inv.InvoiceId,
                reference = inv.InvoiceNumber,
                clientName = c?.CompanyName ?? $"Client {inv.ClientId}",
                amount = inv.TotalAmount,
                status = inv.InvoiceStatus
            });
        }

        return Ok(new
        {
            success = true,
            data = new
            {
                totalInvoicesBilled,
                totalInvoiceAmount,
                totalArOutstanding,
                collectionRate,
                cashInflowThisMonth,
                duplicateAlerts,
                accountsNearDueDate,
                cashFlowAnalytics,
                topPayingClients,
                needsAttention
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Client Accounts
    // GET /api/financial-manager/clients
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("clients")]
    public async Task<IActionResult> GetClients()
    {
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();
        var data = clients.Select(c => new
        {
            clientId = c.ClientId,
            clientCode = ResolveClientCode(c.ClientCode, c.CompanyName, c.ClientId),
            companyName = c.CompanyName,
            status = (c.IsActive ?? true) ? "Active" : "Inactive",
            isActive = c.IsActive ?? true
        }).ToList();

        return Ok(new
        {
            success = true,
            count = data.Count,
            data
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Rate Configuration
    // GET /api/financial-manager/rate-configurations
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("rate-configurations")]
    public async Task<IActionResult> GetRateConfigurations()
    {
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();
        var settings = await _fomsDb.ClientFinanceSettings.AsNoTracking().ToListAsync();
        var rates = await _fomsDb.ClientRates.AsNoTracking().ToListAsync();

        var data = clients.Select(c =>
        {
            var s = settings.FirstOrDefault(st => st.ClientId == c.ClientId);
            var clientRates = rates.Where(r => r.ClientId == c.ClientId).ToList();
            var areas = clientRates
                .Where(r => !string.IsNullOrEmpty(r.DeliveryArea))
                .Select(r => r.DeliveryArea!)
                .Distinct()
                .ToList();

            if (areas.Count == 0)
            {
                areas = new List<string> { "NCR", "Luzon" };
            }

            return new
            {
                clientId = c.ClientId,
                clientName = c.CompanyName,
                configuredAreas = areas,
                vatStatus = s?.TaxType ?? "VATable",
                vatRate = 12,
                agreedSchedule = s?.BillingTerms ?? "Monthly"
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            data
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Waybills & POD
    // GET /api/financial-manager/waybills
    // POST /api/financial-manager/waybills
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("waybills")]
    public async Task<IActionResult> GetWaybills()
    {
        var waybills = await _fomsDb.Waybills.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var data = waybills.Select(w =>
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == w.ClientId);
            return new
            {
                waybillId = w.WaybillId,
                waybillNumber = w.WaybillNumber,
                clientId = w.ClientId,
                clientName = c?.CompanyName ?? $"Client {w.ClientId}",
                origin = w.Origin,
                destination = w.Destination,
                deliveryArea = w.DeliveryArea,
                actualWeight = w.ActualWeight,
                numberOfBoxes = w.NumberOfBoxes,
                declaredValue = w.DeclaredValue,
                deliveryStatus = w.DeliveryStatus,
                podStatus = w.PodStatus,
                isBilled = w.IsBilled,
                createdAt = w.CreatedAt
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            count = data.Count,
            data
        });
    }

    [HttpPost("waybills")]
    public async Task<IActionResult> CreateWaybill([FromBody] WaybillCreateDto dto)
    {
        var waybill = new Waybill
        {
            WaybillNumber = dto.WaybillNumber ?? $"WB-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(1000, 9999)}",
            ClientId = dto.ClientId,
            Origin = dto.Origin,
            Destination = dto.Destination,
            DeliveryArea = dto.DeliveryArea ?? "NCR",
            ActualWeight = dto.ActualWeight,
            LengthCm = dto.LengthCm,
            WidthCm = dto.WidthCm,
            HeightCm = dto.HeightCm,
            NumberOfBoxes = dto.NumberOfBoxes ?? 1,
            DeclaredValue = dto.DeclaredValue,
            DeliveryStatus = dto.DeliveryStatus ?? "Delivered",
            PodStatus = dto.PodStatus ?? "Validated",
            IsBilled = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _fomsDb.Waybills.Add(waybill);
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("CREATE_WAYBILL", "Waybills", waybill.WaybillId.ToString(), $"Waybill {waybill.WaybillNumber} recorded.");

        return Ok(new
        {
            success = true,
            message = "Waybill recorded successfully.",
            data = waybill
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Create Invoice
    // GET /api/financial-manager/invoices/eligible-clients
    // POST /api/financial-manager/invoices/create
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("invoices/eligible-clients")]
    public async Task<IActionResult> GetEligibleClients()
    {
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();
        var unbilledWaybills = await _fomsDb.Waybills
            .Where(w => !w.IsBilled && (w.PodStatus == "Validated" || w.PodStatus == "Received" || w.PodStatus == "CTC Verified"))
            .AsNoTracking()
            .ToListAsync();
        var settings = await _fomsDb.ClientFinanceSettings.AsNoTracking().ToListAsync();

        var data = clients.Select(c =>
        {
            var count = unbilledWaybills.Count(w => w.ClientId == c.ClientId);
            var s = settings.FirstOrDefault(st => st.ClientId == c.ClientId);
            return new
            {
                clientId = c.ClientId,
                clientName = c.CompanyName,
                billingSchedule = s?.BillingTerms ?? "Monthly",
                unbilledWaybills = count
            };
        }).Where(x => x.unbilledWaybills > 0).ToList();

        return Ok(new
        {
            success = true,
            data
        });
    }

    [HttpPost("invoices/create")]
    public async Task<IActionResult> CreateInvoice([FromBody] CreateInvoiceRequestDto dto)
    {
        var client = await _fomsDb.Clients.FindAsync(dto.ClientId);
        if (client == null)
            return NotFound(new { success = false, message = "Client not found." });

        var nextId = (await _fomsDb.Invoices.MaxAsync(i => (int?)i.InvoiceId) ?? 0) + 1;
        var invNumber = $"INV-{DateTime.UtcNow.Year}-{nextId:D3}";

        var waybills = await _fomsDb.Waybills
            .Where(w => dto.WaybillIds.Contains(w.WaybillId) && w.ClientId == dto.ClientId)
            .ToListAsync();

        decimal totalAmount = dto.TotalAmount > 0
            ? dto.TotalAmount
            : waybills.Sum(w => (w.ActualWeight ?? 1m) * 150m);

        if (totalAmount <= 0) totalAmount = 50000m;

        var invoice = new Invoice
        {
            InvoiceNumber = invNumber,
            ClientId = dto.ClientId,
            BillingPeriod = dto.BillingPeriod ?? $"{DateTime.UtcNow:MMMM yyyy}",
            DueDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)),
            TotalAmount = totalAmount,
            PaidAmount = 0m,
            OutstandingBalance = totalAmount,
            InvoiceStatus = "Pending Validation",
            ValidationStatus = "Pending Validation",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _fomsDb.Invoices.Add(invoice);
        await _fomsDb.SaveChangesAsync();

        foreach (var wb in waybills)
        {
            wb.IsBilled = true;
            wb.InvoiceId = invoice.InvoiceId;
        }

        _fomsDb.InvoiceLineItems.Add(new InvoiceLineItem
        {
            InvoiceId = invoice.InvoiceId,
            Description = $"Logistics Services ({waybills.Count} waybills)",
            Quantity = Math.Max(1, waybills.Count),
            UnitPrice = Math.Round(totalAmount / Math.Max(1, waybills.Count), 2),
            LineTotal = totalAmount,
            CreatedAt = DateTime.UtcNow
        });

        _fomsDb.InvoiceComputations.Add(new InvoiceComputation
        {
            InvoiceId = invoice.InvoiceId,
            Subtotal = Math.Round(totalAmount / 1.12m, 2),
            VatAmount = Math.Round(totalAmount - (totalAmount / 1.12m), 2),
            DiscountAmount = 0m,
            TotalAmount = totalAmount,
            ComputedAt = DateTime.UtcNow
        });

        _fomsDb.AccountsReceivable.Add(new AccountsReceivable
        {
            InvoiceId = invoice.InvoiceId,
            ClientId = invoice.ClientId ?? 0,
            InvoiceAmount = invoice.TotalAmount,
            PaidAmount = 0m,
            OutstandingBalance = invoice.TotalAmount,
            OverpaymentAmount = 0m,
            ArStatus = "Outstanding",
            DueDate = invoice.DueDate,
            AgingBucket = "0-30 days",
            CollectionPriority = "Normal",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });

        await LogAuditAsync("CREATE_INVOICE", "Invoices", invoice.InvoiceId.ToString(), $"Invoice {invoice.InvoiceNumber} created for {client.CompanyName}.");

        _fomsDb.Notifications.Add(new Notification
        {
            RecipientRole = "Head Accountant",
            Type = "Invoice Review",
            Title = "New Invoice Awaiting Validation",
            Message = $"Invoice {invoice.InvoiceNumber} for {client.CompanyName} was created and is pending validation.",
            RelatedRecordType = "Invoice",
            RelatedRecordId = invoice.InvoiceId,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            message = "Invoice created successfully.",
            data = new
            {
                invoiceId = invoice.InvoiceId,
                invoiceNumber = invoice.InvoiceNumber,
                totalAmount = invoice.TotalAmount,
                invoiceStatus = invoice.InvoiceStatus
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Invoice List
    // GET /api/financial-manager/invoices
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("invoices")]
    public async Task<IActionResult> GetInvoices()
    {
        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();
        var lineItems = await _fomsDb.InvoiceLineItems.AsNoTracking().ToListAsync();

        var data = invoices.Select(i =>
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == i.ClientId);
            var waybillCount = lineItems.Count(li => li.InvoiceId == i.InvoiceId);
            return new
            {
                invoiceId = i.InvoiceId,
                invoiceNumber = i.InvoiceNumber,
                clientName = c?.CompanyName ?? $"Client {i.ClientId}",
                billingPeriod = i.BillingPeriod ?? "October 2026",
                waybillCount = waybillCount > 0 ? waybillCount : 1,
                date = (i.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
                totalAmount = i.TotalAmount,
                invoiceStatus = i.InvoiceStatus ?? "Pending Validation"
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            data
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Billing Validation
    // GET /api/financial-manager/billing-validation
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("billing-validation")]
    public async Task<IActionResult> GetBillingValidation()
    {
        var billingDocs = await _fomsDb.BillingDocuments.AsNoTracking().ToListAsync();
        var waybills = await _fomsDb.Waybills.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var data = billingDocs.Select(b =>
        {
            var wb = waybills.FirstOrDefault(w => w.WaybillId == b.WaybillId);
            var c = clients.FirstOrDefault(cl => cl.ClientId == b.ClientId);
            return new
            {
                waybillNo = wb?.WaybillNumber ?? $"WB-{b.WaybillId}",
                client = c?.CompanyName ?? $"Client {b.ClientId}",
                computedAmount = b.ComputedAmount,
                status = b.ValidationStatus ?? "Pending Validation",
                ctcStatus = b.CtcStatus ?? "Standard",
                actions = "Validate"
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            data
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Invoice Review
    // GET /api/financial-manager/invoice-review
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("invoice-review")]
    public async Task<IActionResult> GetInvoiceReview()
    {
        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var pendingApproval = invoices.Count(i => i.InvoiceStatus == "Pending Validation" || i.InvoiceStatus == "For Review");
        var approvedInvoices = invoices.Count(i => i.InvoiceStatus == "Approved" || i.InvoiceStatus == "Paid");
        var totalInvoicedValue = invoices.Sum(i => i.TotalAmount);

        var queue = invoices.Select(i =>
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == i.ClientId);
            return new
            {
                clientId = i.ClientId,
                clientName = c?.CompanyName ?? $"Client {i.ClientId}",
                status = i.InvoiceStatus ?? "Pending Validation",
                totalValue = i.TotalAmount
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            summary = new
            {
                pendingApproval,
                approvedInvoices,
                totalInvoicedValue
            },
            data = queue
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Accounts Receivable
    // GET /api/financial-manager/accounts-receivable
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("accounts-receivable")]
    public async Task<IActionResult> GetAccountsReceivable()
    {
        var arList = await _fomsDb.AccountsReceivable.AsNoTracking().ToListAsync();
        var invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        decimal totalAr = 0m, days0to30 = 0m, days31to60 = 0m, days61to90 = 0m, days90plus = 0m;
        var now = DateOnly.FromDateTime(DateTime.UtcNow);

        var items = new List<object>();

        if (arList.Any())
        {
            foreach (var ar in arList)
            {
                var bal = ar.OutstandingBalance ?? 0m;
                totalAr += bal;
                int days = 0;
                if (ar.DueDate.HasValue)
                {
                    days = now.DayNumber - ar.DueDate.Value.DayNumber;
                }

                if (days <= 30) days0to30 += bal;
                else if (days <= 60) days31to60 += bal;
                else if (days <= 90) days61to90 += bal;
                else days90plus += bal;

                var c = clients.FirstOrDefault(cl => cl.ClientId == ar.ClientId);
                items.Add(new
                {
                    arId = ar.ArId,
                    clientId = ar.ClientId,
                    clientName = c?.CompanyName ?? $"Client {ar.ClientId}",
                    invoiceAmount = ar.InvoiceAmount,
                    paidAmount = ar.PaidAmount ?? 0m,
                    outstandingBalance = bal,
                    status = ar.ArStatus ?? (bal <= 0 ? "Fully Paid" : "Outstanding"),
                    dueDate = ar.DueDate?.ToString("yyyy-MM-dd"),
                    agingBucket = days <= 30 ? "0-30 days" : days <= 60 ? "31-60 days" : days <= 90 ? "61-90 days" : "90+ days"
                });
            }
        }
        else
        {
            foreach (var inv in invoices)
            {
                var bal = inv.OutstandingBalance ?? (inv.TotalAmount - (inv.PaidAmount ?? 0m));
                totalAr += bal;
                int days = 0;
                if (inv.DueDate.HasValue)
                {
                    days = now.DayNumber - inv.DueDate.Value.DayNumber;
                }

                if (days <= 30) days0to30 += bal;
                else if (days <= 60) days31to60 += bal;
                else if (days <= 90) days61to90 += bal;
                else days90plus += bal;

                var c = clients.FirstOrDefault(cl => cl.ClientId == inv.ClientId);
                items.Add(new
                {
                    arId = inv.InvoiceId,
                    clientId = inv.ClientId,
                    clientName = c?.CompanyName ?? $"Client {inv.ClientId}",
                    invoiceAmount = inv.TotalAmount,
                    paidAmount = inv.PaidAmount ?? 0m,
                    outstandingBalance = bal,
                    status = bal <= 0 ? "Fully Paid" : (days > 0 ? "Overdue" : "Outstanding"),
                    dueDate = inv.DueDate?.ToString("yyyy-MM-dd"),
                    agingBucket = days <= 30 ? "0-30 days" : days <= 60 ? "31-60 days" : days <= 90 ? "61-90 days" : "90+ days"
                });
            }
        }

        return Ok(new
        {
            success = true,
            summary = new
            {
                totalAr,
                days0to30,
                days31to60,
                days61to90,
                days90plus
            },
            managerApprovalQueue = items
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Payments
    // GET /api/financial-manager/payments
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("payments")]
    public async Task<IActionResult> GetPayments()
    {
        var payments = await _fomsDb.Payments.AsNoTracking().ToListAsync();
        var inflows = await _fomsDb.CashInflows.AsNoTracking().ToListAsync();
        var outflows = await _fomsDb.CashOutflows.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var validatedPayments = payments.Where(p => p.PaymentStatus == "Validated" || p.PaymentStatus == "Paid").ToList();
        var totalCashInflow = inflows.Any() ? inflows.Sum(i => i.Amount) : validatedPayments.Sum(p => p.Amount);
        var totalCashOutflow = outflows.Sum(o => o.Amount);
        var netCashFlow = totalCashInflow - totalCashOutflow;
        var pendingValidation = payments.Count(p => p.PaymentStatus == "Pending Finance Validation" || p.PaymentStatus == "Pending" || p.PaymentStatus == "Pending Validation");

        var list = payments.Select(p =>
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == p.ClientId);
            return new
            {
                paymentId = p.PaymentId,
                clientId = p.ClientId,
                clientName = c?.CompanyName ?? $"Client {p.ClientId}",
                amount = p.Amount,
                paymentMethod = p.PaymentMethod ?? "SpeedPay",
                referenceNumber = p.ReferenceNumber,
                paymentStatus = p.PaymentStatus,
                submittedAt = p.SubmittedAt,
                validatedAt = p.ValidatedAt
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            summary = new
            {
                totalCashInflow,
                totalCashOutflow,
                netCashFlow,
                pendingValidation
            },
            data = list
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Official Receipts
    // GET /api/financial-manager/official-receipts
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("official-receipts")]
    public async Task<IActionResult> GetOfficialReceipts()
    {
        var receipts = await _fomsDb.OfficialReceipts.AsNoTracking().ToListAsync();
        var clients = await _fomsDb.Clients.AsNoTracking().ToListAsync();

        var data = receipts.Select(r =>
        {
            var c = clients.FirstOrDefault(cl => cl.ClientId == r.ClientId);
            return new
            {
                clientId = r.ClientId,
                clientName = c?.CompanyName ?? $"Client {r.ClientId}",
                orNumber = r.OrNumber,
                amount = r.IssuedAmount,
                status = r.Status ?? "Issued",
                issuedAt = r.IssuedAt,
                actions = "View OR"
            };
        }).ToList();

        return Ok(new
        {
            success = true,
            count = data.Count,
            data
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Settlement Validation
    // GET /api/financial-manager/settlements/pending
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("settlements/pending")]
    public async Task<IActionResult> GetPendingSettlements()
    {
        var settlements = await _fomsDb.Settlements
            .Where(s => s.Status == "Pending Validation" || s.Status == "Pending")
            .AsNoTracking()
            .ToListAsync();
        var liquidations = await _fomsDb.Liquidations.AsNoTracking().ToListAsync();

        var pendingValidation = settlements.Count;
        var leftoverCash = liquidations.Sum(l => l.LeftoverCash ?? 0m);
        var reimbursements = liquidations.Sum(l => l.ReimbursementAmount ?? 0m);

        return Ok(new
        {
            success = true,
            summary = new
            {
                pendingValidation,
                leftoverCash,
                reimbursements
            },
            data = settlements
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Record Settlement
    // GET /api/financial-manager/settlements
    // POST /api/financial-manager/settlements
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("settlements")]
    public async Task<IActionResult> GetSettlements()
    {
        var settlements = await _fomsDb.Settlements.AsNoTracking().ToListAsync();
        return Ok(new
        {
            success = true,
            count = settlements.Count,
            data = settlements
        });
    }

    [HttpPost("settlements")]
    public async Task<IActionResult> CreateSettlement([FromBody] SettlementCreateDto dto)
    {
        var settlement = new Settlement
        {
            RecordType = dto.RecordType ?? "Trip Settlement",
            CourierTrip = dto.CourierTrip,
            Amount = dto.Amount,
            SubmittedBy = 1,
            SubmittedAt = DateTime.UtcNow,
            Status = "Pending Validation",
            CreatedAt = DateTime.UtcNow
        };

        _fomsDb.Settlements.Add(settlement);
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("CREATE_SETTLEMENT", "Settlements", settlement.SettlementId.ToString(), $"Settlement of {settlement.Amount:C} submitted.");

        return Ok(new
        {
            success = true,
            message = "Settlement recorded successfully.",
            data = settlement
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 15. Adjustment Approval
    // GET /api/financial-manager/adjustments
    // POST /api/financial-manager/adjustments/{id}/approve
    // POST /api/financial-manager/adjustments/{id}/reject
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("adjustments")]
    public async Task<IActionResult> GetAdjustments()
    {
        var adjustments = await _fomsDb.FinancialAdjustments.AsNoTracking().ToListAsync();
        var creditMemos = await _fomsDb.CreditMemos.AsNoTracking().ToListAsync();

        var totalAdjustments = adjustments.Count;
        var totalCreditMemos = creditMemos.Count;
        var pendingApproval = adjustments.Count(a => a.Status == "Pending Approval" || a.Status == "Pending")
                            + creditMemos.Count(c => c.Status == "Pending Approval" || c.Status == "Pending");
        var totalRequests = totalAdjustments + totalCreditMemos;

        return Ok(new
        {
            success = true,
            summary = new
            {
                totalAdjustments,
                creditMemos = totalCreditMemos,
                pendingApproval,
                totalRequests
            },
            data = adjustments
        });
    }

    [HttpPost("adjustments/{id}/approve")]
    public async Task<IActionResult> ApproveAdjustment(int id)
    {
        var adj = await _fomsDb.FinancialAdjustments.FindAsync(id);
        if (adj == null)
            return NotFound(new { success = false, message = "Adjustment not found." });

        adj.Status = "Approved";
        adj.ApprovedBy = 1;
        adj.ApprovedAt = DateTime.UtcNow;

        if (adj.InvoiceId.HasValue)
        {
            var ar = await _fomsDb.AccountsReceivable.FirstOrDefaultAsync(a => a.InvoiceId == adj.InvoiceId.Value);
            if (ar != null && (ar.OutstandingBalance ?? 0) > 0)
            {
                ar.OutstandingBalance = Math.Max(0m, (ar.OutstandingBalance ?? 0) - adj.Amount);
                if (ar.OutstandingBalance == 0) ar.ArStatus = "Fully Paid";
            }
        }

        await _fomsDb.SaveChangesAsync();
        await LogAuditAsync("APPROVE_ADJUSTMENT", "FinancialAdjustments", id.ToString(), $"Adjustment #{id} approved.");

        return Ok(new { success = true, message = "Adjustment approved successfully.", data = adj });
    }

    [HttpPost("adjustments/{id}/reject")]
    public async Task<IActionResult> RejectAdjustment(int id, [FromBody] RejectRequestDto? dto)
    {
        var adj = await _fomsDb.FinancialAdjustments.FindAsync(id);
        if (adj == null)
            return NotFound(new { success = false, message = "Adjustment not found." });

        adj.Status = "Rejected";
        adj.ApprovedBy = 1;
        adj.ApprovedAt = DateTime.UtcNow;
        await _fomsDb.SaveChangesAsync();

        await LogAuditAsync("REJECT_ADJUSTMENT", "FinancialAdjustments", id.ToString(), $"Adjustment #{id} rejected: {dto?.Reason ?? "None"}");

        return Ok(new { success = true, message = "Adjustment rejected.", data = adj });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 16. Liquidation Reports
    // GET /api/financial-manager/liquidations
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("liquidations")]
    public async Task<IActionResult> GetLiquidations()
    {
        var liquidations = await _fomsDb.Liquidations.AsNoTracking().ToListAsync();
        var data = liquidations.Select(l => new
        {
            liquidationId = l.LiquidationId,
            referenceNumber = l.ReferenceNumber ?? $"LIQ-{l.LiquidationId:D4}",
            submittedBy = l.SubmittedByName ?? $"Employee {l.SubmittedBy}",
            dateSubmitted = l.DateSubmitted ?? l.CreatedAt,
            amount = l.TotalAmount,
            status = l.Status ?? "Pending Validation",
            leftoverCash = l.LeftoverCash ?? 0m,
            reimbursementAmount = l.ReimbursementAmount ?? 0m
        }).ToList();

        return Ok(new
        {
            success = true,
            count = data.Count,
            data
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 17. Cash Flow
    // GET /api/financial-manager/cash-flow
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("cash-flow")]
    public async Task<IActionResult> GetCashFlow()
    {
        var inflows = await _fomsDb.CashInflows.AsNoTracking().ToListAsync();
        var outflows = await _fomsDb.CashOutflows.AsNoTracking().ToListAsync();

        var totalInflow = inflows.Sum(i => i.Amount);
        var totalOutflow = outflows.Sum(o => o.Amount);
        var netCashFlow = totalInflow - totalOutflow;

        var records = new List<object>();
        foreach (var inf in inflows)
        {
            records.Add(new
            {
                id = $"IN-{inf.InflowId}",
                type = "Inflow",
                category = inf.Source ?? "Collection",
                amount = inf.Amount,
                referenceNumber = inf.ReferenceNumber,
                date = inf.TransactionDate ?? inf.CreatedAt,
                status = inf.Status ?? "Validated"
            });
        }
        foreach (var outf in outflows)
        {
            records.Add(new
            {
                id = $"OUT-{outf.OutflowId}",
                type = "Outflow",
                category = outf.Category ?? "Disbursement",
                amount = outf.Amount,
                referenceNumber = outf.Description,
                date = outf.TransactionDate ?? outf.CreatedAt,
                status = outf.Status ?? "Approved"
            });
        }

        return Ok(new
        {
            success = true,
            summary = new
            {
                totalInflow,
                totalOutflow,
                netCashFlow
            },
            data = records.OrderByDescending(r => ((dynamic)r).date).ToList()
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 18. Unique Documents
    // GET /api/financial-manager/ai/unique-documents
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("ai/unique-documents")]
    public async Task<IActionResult> GetUniqueDocuments()
    {
        var documents = await _fomsDb.AIReviewHistories
            .Where(d => d.FinalDecision == "Unique" || d.FinalDecision == "Clean")
            .AsNoTracking()
            .ToListAsync();

        return Ok(new
        {
            success = true,
            count = documents.Count,
            data = documents
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 19. Review History
    // GET /api/financial-manager/ai/review-history
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("ai/review-history")]
    public async Task<IActionResult> GetReviewHistory()
    {
        var history = await _fomsDb.AIReviewHistories.AsNoTracking().ToListAsync();
        return Ok(new
        {
            success = true,
            count = history.Count,
            data = history
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 20. Reports
    // POST /api/financial-manager/reports/generate
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("reports/generate")]
    public async Task<IActionResult> GenerateReport([FromBody] ReportGenerateRequestDto dto)
    {
        var reportType = dto?.ReportType ?? "Invoice Summary";
        object reportData;

        switch (reportType.Trim())
        {
            case "Aging of Accounts":
                var ar = await _fomsDb.AccountsReceivable.AsNoTracking().ToListAsync();
                reportData = ar;
                break;

            case "Collection Summary":
                var col = await _fomsDb.Payments.Where(p => p.PaymentStatus == "Validated" || p.PaymentStatus == "Paid").AsNoTracking().ToListAsync();
                reportData = col;
                break;

            case "Duplicate Alert Summary":
                var dups = await _fomsDb.AIReviewHistories.Where(a => a.FinalDecision == "Duplicate").AsNoTracking().ToListAsync();
                reportData = dups;
                break;

            case "Payment Validation Summary":
                var payVal = await _fomsDb.Payments.AsNoTracking().ToListAsync();
                reportData = payVal;
                break;

            case "Cash Flow Summary":
                var cfIn = await _fomsDb.CashInflows.AsNoTracking().ToListAsync();
                var cfOut = await _fomsDb.CashOutflows.AsNoTracking().ToListAsync();
                reportData = new { inflows = cfIn, outflows = cfOut };
                break;

            case "Adjustment Summary":
                var adj = await _fomsDb.FinancialAdjustments.AsNoTracking().ToListAsync();
                reportData = adj;
                break;

            case "Liquidation Summary":
                var liq = await _fomsDb.Liquidations.AsNoTracking().ToListAsync();
                reportData = liq;
                break;

            case "Invoice Summary":
            default:
                var inv = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
                reportData = inv;
                break;
        }

        await LogAuditAsync("GENERATE_REPORT", "Reports", reportType, $"Generated {reportType} report.");

        return Ok(new
        {
            success = true,
            reportType,
            generatedAt = DateTime.UtcNow,
            data = reportData
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 21. Audit Logs
    // GET /api/financial-manager/audit-logs
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs()
    {
        var logs = await _fomsDb.AuditLogs
            .OrderByDescending(a => a.created_at)
            .AsNoTracking()
            .ToListAsync();

        var data = logs.Select(a => new
        {
            auditId = a.audit_id,
            role = a.role ?? "System",
            action = a.action,
            module = a.module,
            remarks = a.remarks ?? a.after_value,
            createdAt = (a.created_at ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss")
        }).ToList();

        return Ok(new
        {
            success = true,
            data
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 22. AI Output History
    // GET /api/financial-manager/ai/output-history
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("ai/output-history")]
    public async Task<IActionResult> GetAiOutputHistory()
    {
        try
        {
            var history = await _fomsDb.AIOutputHistories.AsNoTracking().ToListAsync();
            return Ok(new
            {
                success = true,
                data = history,
                warning = history.Count == 0 ? "AI output database unavailable or no records found." : null
            });
        }
        catch
        {
            return Ok(new
            {
                success = true,
                data = new List<object>(),
                warning = "AI output database unavailable or no records found."
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    private static string ResolveClientCode(string? clientCode, string? companyName, int? clientId)
    {
        if (!string.IsNullOrWhiteSpace(clientCode) && !clientCode.StartsWith("CA-", StringComparison.OrdinalIgnoreCase))
            return clientCode;

        var name = (companyName ?? "").ToLowerInvariant();
        string prefix = "CLI";
        if (name.Contains("lazada")) prefix = "LZD";
        else if (name.Contains("shopee")) prefix = "SHP";
        else if (name.Contains("tiktok")) prefix = "TKT";
        else if (name.Contains("zalora")) prefix = "ZAL";
        else if (name.Contains("test")) prefix = "TST";
        else if (!string.IsNullOrWhiteSpace(companyName))
        {
            var cleanLetters = new string(companyName.Where(char.IsLetter).ToArray());
            prefix = cleanLetters.Length >= 3 ? cleanLetters[..3].ToUpperInvariant() : "CLI";
        }

        return $"{prefix}-{(clientId ?? 1):D3}";
    }

    private async Task LogAuditAsync(string action, string module, string recordId, string remarks)
    {
        try
        {
            _fomsDb.AuditLogs.Add(new AuditLog
            {
                user_id = 1,
                role = "Financial Manager",
                action = action,
                module = module,
                affected_record_id = int.TryParse(recordId, out var id) ? id : null,
                remarks = remarks,
                created_at = DateTime.UtcNow
            });
            await _fomsDb.SaveChangesAsync();
        }
        catch
        {
            // Audit log write failure must not abort operation
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTING DTOS
// ─────────────────────────────────────────────────────────────────────────────
public class WaybillCreateDto
{
    public string? WaybillNumber { get; set; }
    public int ClientId { get; set; }
    public string? Origin { get; set; }
    public string? Destination { get; set; }
    public string? DeliveryArea { get; set; }
    public decimal? ActualWeight { get; set; }
    public decimal? LengthCm { get; set; }
    public decimal? WidthCm { get; set; }
    public decimal? HeightCm { get; set; }
    public int? NumberOfBoxes { get; set; }
    public decimal? DeclaredValue { get; set; }
    public string? DeliveryStatus { get; set; }
    public string? PodStatus { get; set; }
}

public class CreateInvoiceRequestDto
{
    public int ClientId { get; set; }
    public List<int> WaybillIds { get; set; } = new();
    public string? BillingPeriod { get; set; }
    public decimal TotalAmount { get; set; }
    public string? Remarks { get; set; }
}

public class SettlementCreateDto
{
    public string? RecordType { get; set; }
    public string? CourierTrip { get; set; }
    public decimal Amount { get; set; }
}

public class RejectRequestDto
{
    public string? Reason { get; set; }
}

public class ReportGenerateRequestDto
{
    public string? ReportType { get; set; }
    public string? DateFrom { get; set; }
    public string? DateTo { get; set; }
    public string? Status { get; set; }
}
