using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/official-receipts")]
[Route("official-receipts")]
[ApiController]
public class OfficialReceiptsController : ControllerBase
{
    private readonly IRepository<OfficialReceipt> _repository;
    private readonly IApplicationDbContext _context;
    private readonly FomsDbContext _fomsDb;

    public OfficialReceiptsController(
        IRepository<OfficialReceipt> repository, 
        IApplicationDbContext context,
        FomsDbContext fomsDb)
    {
        _repository = repository;
        _context = context;
        _fomsDb = fomsDb;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var dbReceipts = await (from r in _fomsDb.OfficialReceipts.AsNoTracking()
                                join p in _fomsDb.Payments.AsNoTracking() on r.PaymentId equals p.PaymentId into pr
                                from p in pr.DefaultIfEmpty()
                                join i in _fomsDb.Invoices.AsNoTracking() on r.InvoiceId equals i.InvoiceId into ir
                                from i in ir.DefaultIfEmpty()
                                join c in _fomsDb.Clients.AsNoTracking() on r.ClientId equals c.ClientId into cr
                                from c in cr.DefaultIfEmpty()
                                select new
                                {
                                    id = r.OrNumber ?? ("OR-" + r.OrId),
                                    receiptNumber = r.OrNumber ?? ("OR-2026-" + r.OrId.ToString("D4")),
                                    referenceNumber = p != null ? p.ReferenceNumber : ("REF-" + r.OrId),
                                    paymentId = p != null ? (p.ReferenceNumber ?? "PAY-" + p.PaymentId) : ("PAY-" + r.PaymentId),
                                    clientId = c != null ? (c.ClientCode ?? "CA-" + c.ClientId) : ("CA-" + r.ClientId),
                                    clientName = c != null ? c.CompanyName : "Client",
                                    invoiceId = i != null ? (i.InvoiceNumber ?? "INV-" + i.InvoiceId) : ("INV-" + r.InvoiceId),
                                    invoiceNumber = i != null ? i.InvoiceNumber : ("INV-" + r.InvoiceId),
                                    amount = r.IssuedAmount > 0 ? r.IssuedAmount : (p != null ? p.Amount : 0m),
                                    issuedAt = (r.IssuedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
                                    issuedBy = r.IssuedBy ?? "Crystalyn Joyce C. Fajardo",
                                    paymentMethod = p != null ? (p.PaymentMethod ?? "Bank Transfer") : "Bank Transfer",
                                    status = r.Status ?? "Issued OR"
                                }).ToListAsync();

        if (dbReceipts.Any())
            return Ok(dbReceipts);

        var legacy = await _repository.GetAllAsync();
        return Ok(legacy);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var dbReceipt = await (from r in _fomsDb.OfficialReceipts.AsNoTracking()
                               join p in _fomsDb.Payments.AsNoTracking() on r.PaymentId equals p.PaymentId into pr
                               from p in pr.DefaultIfEmpty()
                               join i in _fomsDb.Invoices.AsNoTracking() on r.InvoiceId equals i.InvoiceId into ir
                               from i in ir.DefaultIfEmpty()
                               join c in _fomsDb.Clients.AsNoTracking() on r.ClientId equals c.ClientId into cr
                               from c in cr.DefaultIfEmpty()
                               where r.OrNumber == id || r.OrId.ToString() == id
                               select new
                               {
                                   id = r.OrNumber ?? ("OR-" + r.OrId),
                                   receiptNumber = r.OrNumber ?? ("OR-2026-" + r.OrId.ToString("D4")),
                                   referenceNumber = p != null ? p.ReferenceNumber : ("REF-" + r.OrId),
                                   paymentId = p != null ? (p.ReferenceNumber ?? "PAY-" + p.PaymentId) : ("PAY-" + r.PaymentId),
                                   clientId = c != null ? (c.ClientCode ?? "CA-" + c.ClientId) : ("CA-" + r.ClientId),
                                   clientName = c != null ? c.CompanyName : "Client",
                                   invoiceId = i != null ? (i.InvoiceNumber ?? "INV-" + i.InvoiceId) : ("INV-" + r.InvoiceId),
                                   invoiceNumber = i != null ? i.InvoiceNumber : ("INV-" + r.InvoiceId),
                                   amount = r.IssuedAmount > 0 ? r.IssuedAmount : (p != null ? p.Amount : 0m),
                                   issuedAt = (r.IssuedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
                                   issuedBy = r.IssuedBy ?? "Crystalyn Joyce C. Fajardo",
                                   paymentMethod = p != null ? (p.PaymentMethod ?? "Bank Transfer") : "Bank Transfer",
                                   status = r.Status ?? "Issued OR"
                               }).FirstOrDefaultAsync();

        if (dbReceipt != null)
            return Ok(dbReceipt);

        var item = await _repository.GetByIdAsync(id);
        return item == null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] OfficialReceipt request)
    {
        await _repository.AddAsync(request);
        await _context.SaveChangesAsync(default);
        return CreatedAtAction(nameof(GetById), new { id = request.Id }, request);
    }
}
