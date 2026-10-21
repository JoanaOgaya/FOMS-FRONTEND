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

    [HttpGet]
    public async Task<IActionResult> GetClients()
    {
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

    public class ClientInputDto
    {
        public string? Id { get; set; }
        public string? ClientCode { get; set; }
        public string? Name { get; set; }
        public string? BusinessName { get; set; }
        public string? ContactPerson { get; set; }
        public string? ContactNumber { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? Address { get; set; }
        public string? Tin { get; set; }
        public decimal? CreditLimit { get; set; }
        public string? Status { get; set; }
        public string? BillingSchedule { get; set; }
    }

    [HttpPost]
    public async Task<IActionResult> CreateClient([FromBody] ClientInputDto dto)
    {
        var name = !string.IsNullOrWhiteSpace(dto.Name) ? dto.Name : "New Client";
        var code = dto.ClientCode;
        if (string.IsNullOrWhiteSpace(code))
        {
            var lower = name.ToLowerInvariant();
            string prefix = "CLI";
            if (lower.Contains("lazada")) prefix = "LZD";
            else if (lower.Contains("shopee")) prefix = "SHP";
            else if (lower.Contains("tiktok")) prefix = "TKT";
            else if (lower.Contains("zalora")) prefix = "ZAL";
            else if (lower.Contains("test")) prefix = "TST";
            else
            {
                var cleanLetters = new string(name.Where(char.IsLetter).ToArray());
                prefix = cleanLetters.Length >= 3 ? cleanLetters[..3].ToUpperInvariant() : "CLI";
            }
            var count = await _context.Clients.CountAsync(c => c.ClientCode.StartsWith(prefix));
            code = $"{prefix}-{(count + 1):D3}";
        }

        var contactPhone = !string.IsNullOrWhiteSpace(dto.ContactNumber) ? dto.ContactNumber : (!string.IsNullOrWhiteSpace(dto.Phone) ? dto.Phone : "09000000000");
        var busName = !string.IsNullOrWhiteSpace(dto.BusinessName) ? dto.BusinessName : name;
        var email = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email : $"{name.ToLower().Replace(" ", "")}@client.com";

        var client = new FOMS.Domain.Entities.Client
        {
            Id = code,
            ClientCode = code,
            Name = name,
            BusinessName = busName,
            ContactPerson = !string.IsNullOrWhiteSpace(dto.ContactPerson) ? dto.ContactPerson : "Operations Manager",
            ContactNumber = contactPhone,
            Email = email,
            Address = dto.Address ?? "Metro Manila, Philippines",
            Tin = dto.Tin,
            CreditLimit = dto.CreditLimit ?? 100000m,
            CurrentBalance = 0,
            TotalBilled = 0,
            TotalPaid = 0,
            Status = dto.Status ?? "Active",
            DateRegistered = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            LastTransaction = "—",
            Archived = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Clients.Add(client);
        await _context.SaveChangesAsync(default);

        return Ok(new
        {
            id = client.Id,
            clientCode = client.ClientCode,
            name = client.Name,
            businessName = client.BusinessName,
            contactPerson = client.ContactPerson,
            contactNumber = client.ContactNumber,
            phone = client.ContactNumber,
            email = client.Email,
            address = client.Address,
            tin = client.Tin,
            region = "Metro Manila",
            serviceArea = "NCR",
            creditLimit = client.CreditLimit,
            currentBalance = client.CurrentBalance,
            totalBilled = client.TotalBilled,
            totalPaid = client.TotalPaid,
            status = client.Status,
            vatStatus = "VATable",
            vatRate = 0.12m,
            billingSchedule = dto.BillingSchedule ?? "Monthly",
            createdAt = client.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ss")
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteClient(string id)
    {
        var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == id || c.ClientCode == id);
        if (client == null) return NotFound();
        _context.Clients.Remove(client);
        await _context.SaveChangesAsync(default);
        return Ok(new { success = true });
    }

    public record ClientArchiveRequest(bool Archived);

    [HttpPut("{id}/archive")]
    public async Task<IActionResult> ArchiveClient(string id, [FromBody] ClientArchiveRequest request)
    {
        var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == id || c.ClientCode == id);
        if (client == null) return NotFound();
        client.Archived = request.Archived;
        await _context.SaveChangesAsync(default);
        return Ok(new { success = true });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateClient(string id, [FromBody] ClientInputDto dto)
    {
        var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == id || c.ClientCode == id);
        if (client == null) return NotFound(new { message = $"Client {id} not found" });

        if (!string.IsNullOrWhiteSpace(dto.Name)) client.Name = dto.Name;
        if (!string.IsNullOrWhiteSpace(dto.BusinessName)) client.BusinessName = dto.BusinessName;
        else if (!string.IsNullOrWhiteSpace(dto.Name)) client.BusinessName = dto.Name;
        if (!string.IsNullOrWhiteSpace(dto.ContactPerson)) client.ContactPerson = dto.ContactPerson;
        var phone = !string.IsNullOrWhiteSpace(dto.ContactNumber) ? dto.ContactNumber : dto.Phone;
        if (!string.IsNullOrWhiteSpace(phone)) client.ContactNumber = phone;
        if (!string.IsNullOrWhiteSpace(dto.Email)) client.Email = dto.Email;
        if (!string.IsNullOrWhiteSpace(dto.Address)) client.Address = dto.Address;
        if (dto.Tin != null) client.Tin = dto.Tin;
        if (dto.CreditLimit.HasValue) client.CreditLimit = dto.CreditLimit.Value;
        if (!string.IsNullOrWhiteSpace(dto.Status)) client.Status = dto.Status;
        client.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(default);

        return Ok(new
        {
            id = client.Id,
            clientCode = client.ClientCode,
            name = client.Name,
            businessName = client.BusinessName,
            contactPerson = client.ContactPerson,
            contactNumber = client.ContactNumber,
            phone = client.ContactNumber,
            email = client.Email,
            address = client.Address,
            tin = client.Tin,
            region = "Metro Manila",
            serviceArea = "NCR",
            creditLimit = client.CreditLimit,
            currentBalance = client.CurrentBalance,
            totalBilled = client.TotalBilled,
            totalPaid = client.TotalPaid,
            status = client.Status,
            vatStatus = "VATable",
            vatRate = 0.12m,
            billingSchedule = dto.BillingSchedule ?? "Monthly",
            createdAt = client.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ss")
        });
    }
}
