using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/test-data")]
public class TestDataController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public TestDataController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> GenerateTestData()
    {
        // For Capstone Presentation Mode only
        var clientId = "CL-TEST1";
        
        // Ensure Client exists
        if (!await _context.Clients.AnyAsync(c => c.Id == clientId))
        {
            _context.Clients.Add(new Client
            {
                Id = clientId,
                ClientCode = "TEST-001",
                Name = "Test Client Co.",
                BusinessName = "Test Client Co.",
                ContactPerson = "John Doe",
                Email = "test@example.com",
                ContactNumber = "123-456-7890",
                Status = "Active",
                Address = "123 Defense Mode St",
                CurrentBalance = 50000m,
                DateRegistered = DateTime.UtcNow.ToString("yyyy-MM-dd")
            });
        }

        // Add dummy invoices
        var inv1 = new Invoice
        {
            Id = Guid.NewGuid().ToString(),
            InvoiceNo = "INV-TEST-001",
            ClientId = clientId,
            ClientName = "Test Client Co.",
            BillingDate = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-dd"),
            DueDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Balance = 25000m,
            AmountPaid = 0m,
            PaymentStatus = "Unpaid",
            AgingBucket = "Current"
        };
        
        var inv2 = new Invoice
        {
            Id = Guid.NewGuid().ToString(),
            InvoiceNo = "INV-TEST-002",
            ClientId = clientId,
            ClientName = "Test Client Co.",
            BillingDate = DateTime.UtcNow.AddDays(-60).ToString("yyyy-MM-dd"),
            DueDate = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-dd"),
            Balance = 25000m,
            AmountPaid = 0m,
            PaymentStatus = "Overdue",
            AgingBucket = "31-60"
        };
        
        _context.Invoices.AddRange(inv1, inv2);

        // Add an inflow
        var inflow = new CashFlowTransaction
        {
            ReferenceNo = "CF-TEST-001",
            Date = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Type = "Inflow",
            Category = "Payment",
            Amount = 10000m,
            Description = "Seed payment for test mode"
        };
        _context.CashFlowTransactions.Add(inflow);
        
        await _context.SaveChangesAsync(default);

        return Ok(new { success = true, message = "Test data generated successfully." });
    }
}
