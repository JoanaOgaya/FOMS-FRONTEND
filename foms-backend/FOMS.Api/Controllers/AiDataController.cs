using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;

namespace FOMS.Api.Controllers;

/// <summary>
/// Dedicated read-only data extraction endpoints for the Python AI Financial Intelligence Layer.
/// Allows the AI Service to sync Waybills, Invoices, Receipts, and Collections data.
/// </summary>
[ApiController]
[Route("api/ai-data")]
[AllowAnonymous]
public class AiDataController : ApiControllerBase
{
    private readonly IApplicationDbContext _context;

    public AiDataController(IApplicationDbContext context)
    {
        _context = context;
    }

    // GET /api/ai-data/waybills?page=1&pageSize=100
    [HttpGet("waybills")]
    public async Task<IActionResult> GetWaybills([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var query = _context.ShipmentRecords.Include(s => s.Client).AsNoTracking();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(s => s.ShipmentDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new
            {
                id = s.Id,
                waybillNumber = s.Id,
                trackingNumber = s.Id,
                shipperName = s.Client != null ? s.Client.Name : "",
                consigneeName = "",
                clientId = s.ClientId,
                origin = s.Origin,
                destination = s.Destination,
                cost = s.Cost,
                status = s.Status,
                createdAt = s.ShipmentDate
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // GET /api/ai-data/invoices?page=1&pageSize=100
    [HttpGet("invoices")]
    public async Task<IActionResult> GetInvoices([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var query = _context.Invoices.AsNoTracking();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(i => i.BillingDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new
            {
                id = i.Id,
                invoiceNo = i.InvoiceNo,
                clientId = i.ClientId,
                clientName = i.ClientName,
                amount = i.TotalAmount,
                balance = i.Balance,
                vatAmount = i.VatAmount,
                netAmount = i.Subtotal,
                status = i.PaymentStatus,
                issueDate = i.BillingDate,
                dueDate = i.DueDate
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // GET /api/ai-data/official-receipts?page=1&pageSize=100
    [HttpGet("official-receipts")]
    public async Task<IActionResult> GetOfficialReceipts([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var query = _context.OfficialReceipts.Include(r => r.PaymentCollection).AsNoTracking();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(r => r.IssuedDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                id = r.Id,
                orNumber = r.ReceiptNumber,
                invoiceNo = r.PaymentCollection != null ? r.PaymentCollection.InvoiceId : "",
                clientId = "",
                clientName = "",
                amountPaid = r.PaymentCollection != null ? r.PaymentCollection.AmountCollected : 0m,
                paymentMethod = r.PaymentCollection != null ? r.PaymentCollection.PaymentMethod : "",
                referenceNo = r.ReceiptNumber,
                issueDate = r.IssuedDate
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // GET /api/ai-data/speedpay-submissions?page=1&pageSize=100
    [HttpGet("speedpay-submissions")]
    public async Task<IActionResult> GetSpeedPaySubmissions([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var query = _context.PaymentTransactions.AsNoTracking();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new
            {
                id = t.Id,
                clientId = t.ClientId,
                invoiceNo = t.InvoiceNo,
                shipmentRecordId = t.ShipmentRecordId,
                amount = t.Amount,
                status = t.Status,
                payMongoCheckoutId = t.PayMongoCheckoutId,
                payMongoPaymentId = t.PayMongoPaymentId,
                referenceOrNumber = t.ReferenceOrNumber,
                receiptUrl = t.ReceiptUrl,
                createdAt = t.CreatedAt
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // GET /api/ai-data/accounts-receivable?page=1&pageSize=100
    [HttpGet("accounts-receivable")]
    public async Task<IActionResult> GetAccountsReceivable([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var query = _context.ReceivableBalances.Include(r => r.Client).AsNoTracking();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderBy(r => r.ClientId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                id = r.Id,
                invoiceId = r.InvoiceId,
                clientId = r.ClientId,
                clientName = r.Client != null ? r.Client.Name : "",
                outstandingBalance = r.BalanceAmount,
                totalOutstanding = r.BalanceAmount,
                currentAmount = r.BalanceAmount,
                overdueAmount = 0m,
                dueDate = r.DueDate.ToString("yyyy-MM-dd"),
                lastPaymentDate = r.DueDate
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // GET /api/ai-data/aging?page=1&pageSize=100
    [HttpGet("aging")]
    public async Task<IActionResult> GetAging([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var query = _context.AgingAccounts.Include(a => a.Client).AsNoTracking();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderBy(a => a.ClientId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                id = a.Id,
                clientId = a.ClientId,
                clientName = a.Client != null ? a.Client.Name : "",
                current0To30 = a.CurrentAmount,
                days31To60 = 0m,
                days61To90 = 0m,
                days90Plus = 0m,
                totalBalance = a.CurrentAmount
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // GET /api/ai-data/payments?page=1&pageSize=100
    [HttpGet("payments")]
    public async Task<IActionResult> GetPayments([FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        var query = _context.Payments.AsNoTracking();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(p => p.PaymentDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new
            {
                id = p.Id,
                clientId = p.ClientId,
                invoiceNo = p.InvoiceNo,
                amount = p.Amount,
                paymentMethod = p.PaymentMethod,
                referenceNumber = p.ReferenceNumber,
                status = p.PaymentStatus,
                date = p.PaymentDate
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    // GET /api/ai-data/collection-history
    [HttpGet("collection-history")]
    public async Task<IActionResult> GetCollectionHistory()
    {
        var items = await _context.PaymentCollections
            .Include(c => c.Invoice)
            .AsNoTracking()
            .OrderByDescending(c => c.CollectedDate)
            .Take(500)
            .Select(c => new
            {
                id = c.Id,
                clientId = c.Invoice != null ? c.Invoice.ClientId : "",
                clientName = c.Invoice != null ? c.Invoice.ClientName : "",
                amountCollected = c.AmountCollected,
                paymentMethod = c.PaymentMethod,
                collectionDate = c.CollectedDate
            })
            .ToListAsync();

        return Ok(items);
    }
}
