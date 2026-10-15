using System.Threading.Tasks;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Features;
using FOMS.Application.Interfaces;

namespace FOMS.Api.Controllers;

[Route("api/clients")]
[Route("api/v1/clients")]
[Route("clients")]
[Route("client-accounts")]
[Route("api/client-accounts")]
[Route("api/v1/client-accounts")]
public class ClientsController : ApiControllerBase
{
    private readonly IApplicationDbContext _context;

    public ClientsController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("lookup/{clientCode}")]
    [Microsoft.AspNetCore.Authorization.AllowAnonymous]
    public async Task<IActionResult> LookupClient(string clientCode)
    {
        var client = await _context.Clients
            .Include(c => c.Invoices)
            .FirstOrDefaultAsync(c => c.ClientCode == clientCode);

        if (client == null)
        {
            return NotFound(new { message = "Client account not found. Please verify your Client Code." });
        }

        var payments = await _context.Payments
            .Where(p => p.ClientId == client.Id)
            .ToListAsync();

        return Ok(new {
            client.Id,
            client.ClientCode,
            client.Name,
            client.BusinessName,
            client.ContactPerson,
            client.ContactNumber,
            client.Email,
            client.Address,
            client.Tin,
            client.CreditLimit,
            client.CurrentBalance,
            client.TotalBilled,
            client.TotalPaid,
            client.Status,
            client.DateRegistered,
            client.LastTransaction,
            client.Archived,
            Invoices = client.Invoices.Select(i => new {
                i.Id,
                i.InvoiceNo,
                i.ClientId,
                i.BillingDate,
                i.DueDate,
                i.Subtotal,
                i.VatRate,
                i.VatAmount,
                i.FreightCharges,
                i.OtherCharges,
                i.TotalAmount,
                i.AmountPaid,
                i.PaymentStatus,
                i.AgingBucket,
                i.DaysOverdue,
                i.Archived
            }).ToList(),
            Payments = payments.Select(p => new {
                p.Id,
                p.OrNumber,
                p.InvoiceId,
                p.InvoiceNo,
                p.ClientId,
                p.ClientName,
                p.PaymentDate,
                p.Amount,
                p.PaymentMethod,
                p.ReferenceNumber,
                p.ProofImageUrl,
                p.Remarks,
                p.RecordedBy,
                p.DateRecorded
            }).ToList()
        });
    }

    public class ClientPortalLoginRequest
    {
        public string ClientCode { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    [HttpPost("portal-login")]
    [Microsoft.AspNetCore.Authorization.AllowAnonymous]
    public async Task<IActionResult> PortalLogin([FromBody] ClientPortalLoginRequest request)
    {
        var client = await _context.Clients
            .Include(c => c.Invoices)
            .FirstOrDefaultAsync(c => c.ClientCode == request.ClientCode);

        if (client == null)
        {
            return Unauthorized(new { message = "Invalid client code or password." });
        }

        // Verify the password using the existing AuthService.VerifyPassword method
        if (!FOMS.Application.Services.AuthService.VerifyPassword(request.Password, client.PasswordHash))
        {
            return Unauthorized(new { message = "Invalid client code or password." });
        }

        var payments = await _context.Payments
            .Where(p => p.ClientId == client.Id)
            .ToListAsync();

        return Ok(new {
            client.Id,
            client.ClientCode,
            client.Name,
            client.BusinessName,
            client.ContactPerson,
            client.ContactNumber,
            client.Email,
            client.Address,
            client.Tin,
            client.CreditLimit,
            client.CurrentBalance,
            client.TotalBilled,
            client.TotalPaid,
            client.Status,
            client.DateRegistered,
            client.LastTransaction,
            client.Archived,
            Invoices = client.Invoices.Select(i => new {
                i.Id,
                i.InvoiceNo,
                i.ClientId,
                i.BillingDate,
                i.DueDate,
                i.Subtotal,
                i.VatRate,
                i.VatAmount,
                i.FreightCharges,
                i.OtherCharges,
                i.TotalAmount,
                i.AmountPaid,
                i.PaymentStatus,
                i.AgingBucket,
                i.DaysOverdue,
                i.Archived
            }).ToList(),
            Payments = payments.Select(p => new {
                p.Id,
                p.OrNumber,
                p.InvoiceId,
                p.InvoiceNo,
                p.ClientId,
                p.ClientName,
                p.PaymentDate,
                p.Amount,
                p.PaymentMethod,
                p.ReferenceNumber,
                p.ProofImageUrl,
                p.Remarks,
                p.RecordedBy,
                p.DateRecorded
            }).ToList()
        });
    }

    private async Task EnsureSeededAsync()
    {
        try
        {
            if (!await _context.Clients.AnyAsync(c => c.Status == "Inactive"))
            {
                var inactiveClient = new FOMS.Domain.Entities.Client
                {
                    Id = "ZAL-001",
                    ClientCode = "ZAL-001",
                    Name = "Zalora Philippines",
                    BusinessName = "Zalora PH",
                    ContactPerson = "Robert Tan",
                    ContactNumber = "09185551234",
                    Email = "finance@zalora.com.ph",
                    Address = "Muntinlupa City, Metro Manila",
                    Tin = "321-654-987",
                    CreditLimit = 250000m,
                    CurrentBalance = 0m,
                    Status = "Inactive"
                };
                _context.Clients.Add(inactiveClient);
                await _context.SaveChangesAsync(default);
            }
        }
        catch { }
    }

    [HttpGet]
    public async Task<IActionResult> GetClients()
    {
        await EnsureSeededAsync();
        var clients = await Mediator.Send(new ClientFeatures.GetClientsQuery());
        var result = clients.Select(c =>
        {
            var code = !string.IsNullOrEmpty(c.ClientCode) ? c.ClientCode : c.Id;
            return new
            {
                id = code,
                clientCode = code,
                clientId = c.Id,
                name = c.Name,
                businessName = c.BusinessName,
                contactPerson = c.ContactPerson,
                contactNumber = c.ContactNumber,
                phone = c.ContactNumber,
                email = c.Email,
                address = c.Address,
                tin = c.Tin,
                region = "Metro Manila",
                serviceArea = "NCR",
                creditLimit = c.CreditLimit,
                currentBalance = c.CurrentBalance,
                totalBilled = c.TotalBilled,
                totalPaid = c.TotalPaid,
                status = c.Status ?? "Active",
                vatStatus = "VATable",
                vatRate = 0.12m,
                billingSchedule = (code == "SHP-001" || code == "CA-002" || c.Name.Contains("Shopee") || code == "TKT-001" || code == "CA-003" || c.Name.Contains("TikTok")) ? "Weekly" : "Monthly",
                createdAt = c.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
                dateRegistered = c.DateRegistered,
                lastTransaction = c.LastTransaction,
                archived = c.Archived
            };
        }).ToList();
        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetClientById(string id)
    {
        var c = await _context.Clients
            .Include(cl => cl.Invoices)
            .FirstOrDefaultAsync(cl => cl.Id == id || cl.ClientCode == id);

        if (c == null) return NotFound(new { message = $"Client {id} not found" });

        var code = !string.IsNullOrEmpty(c.ClientCode) ? c.ClientCode : c.Id;
        return Ok(new
        {
            id = code,
            clientCode = code,
            clientId = c.Id,
            name = c.Name,
            businessName = c.BusinessName,
            contactPerson = c.ContactPerson,
            contactNumber = c.ContactNumber,
            phone = c.ContactNumber,
            email = c.Email,
            address = c.Address,
            tin = c.Tin,
            region = "Metro Manila",
            serviceArea = "NCR",
            creditLimit = c.CreditLimit,
            currentBalance = c.CurrentBalance,
            totalBilled = c.TotalBilled,
            totalPaid = c.TotalPaid,
            status = c.Status ?? "Active",
            vatStatus = "VATable",
            vatRate = 0.12m,
            billingSchedule = (code == "CA-002" || c.Name.Contains("Shopee") || code == "CA-003" || c.Name.Contains("TikTok")) ? "Weekly" : "Monthly",
            createdAt = c.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
            dateRegistered = c.DateRegistered,
            lastTransaction = c.LastTransaction,
            archived = c.Archived
        });
    }

    [HttpPost]
    public async Task<IActionResult> CreateClient([FromBody] ClientFeatures.CreateClientCommand command)
    {
        var client = await Mediator.Send(command);
        return Ok(client);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteClient(string id)
    {
        var result = await Mediator.Send(new ClientFeatures.DeleteClientCommand(id));
        if (!result) return NotFound();
        return Ok(new { success = true });
    }

    public record ClientArchiveRequest(bool Archived);

    [HttpPut("{id}/archive")]
    public async Task<IActionResult> ArchiveClient(string id, [FromBody] ClientArchiveRequest request)
    {
        var result = await Mediator.Send(new ClientFeatures.ArchiveClientCommand(id, request.Archived));
        if (!result) return NotFound();
        return Ok(new { success = true });
    }
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateClient(string id, [FromBody] ClientFeatures.UpdateClientCommand command)
    {
        if (id != command.Id) return BadRequest(new { message = "ID mismatch" });
        var client = await Mediator.Send(command);
        if (client == null) return NotFound();
        return Ok(client);
    }
}
