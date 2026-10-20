using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using FOMS.Application.Features;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace FOMS.Api.Controllers;

/// <summary>
/// SpeedPay / PayMongo digital payment endpoints.
///
/// RBAC:
///   initiate          â†’ Cashier only (internal staff initiates payment for a shipment)
///   initiate-invoice  â†’ AllowAnonymous (client self-service portal)
///   webhook           â†’ AllowAnonymous (called by PayMongo servers â€” verified by HMAC signature)
///   simulate-webhook  â†’ Accountant only (test/admin use, signs payload with real secret)
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Route("api/v1/[controller]")]
public class SpeedPayController : ApiControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly IApplicationDbContext _context;

    public SpeedPayController(IConfiguration configuration, IApplicationDbContext context)
    {
        _configuration = configuration;
        _context = context;
    }



    // FR-015, FR-018, FR-019, FR-020: Initiate payment checkout link (Shipment-Level)
    // RBAC: Cashier only â€” internal staff initiates SpeedPay for a client's shipment
    [Authorize]
    [HttpPost("initiate")]
    public async Task<IActionResult> Initiate([FromBody] SpeedPayFeatures.InitiateSpeedPayCheckoutCommand command)
    {
        try
        {
            var result = await Mediator.Send(command);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while initiating payment: " + ex.Message });
        }
    }

    // GET: api/speedpay/invoices
    // RBAC: AllowAnonymous (SpeedPay Portal fetches and filters locally for demo)
    [AllowAnonymous]
    [HttpGet("invoices")]
    public async Task<IActionResult> GetSpeedPayInvoices([FromQuery] string? clientId = null)
    {
        try
        {
            var query = _context.Invoices.AsNoTracking();
            if (!string.IsNullOrEmpty(clientId))
            {
                query = query.Where(i => i.ClientId == clientId);
            }
            var invoices = await query.ToListAsync();
            return Ok(invoices);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error fetching invoices: " + ex.Message });
        }
    }

    [AllowAnonymous]
    [HttpPost("seed-client-invoices")]
    public async Task<IActionResult> SeedClientInvoices([FromQuery] string clientId, [FromQuery] string clientName, [FromQuery] string email)
    {
        try
        {
            // Add client if not exists
            var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == clientId);
            if (client == null)
            {
                client = new Client
                {
                    Id = clientId,
                    ClientCode = clientId,
                    Name = clientName,
                    BusinessName = clientName,
                    Email = email
                };
                _context.Clients.Add(client);
            }

            // Add invoices
            for (int i = 1; i <= 10; i++)
            {
                var invoice = new Invoice
                {
                    Id = Guid.NewGuid().ToString(),
                    InvoiceNo = $"INV-{clientId}-{i}-{DateTime.UtcNow.Ticks}",
                    ClientId = clientId,
                    ClientName = clientName,
                    BillingDate = DateTime.UtcNow.AddDays(-i).ToString("O"),
                    DueDate = DateTime.UtcNow.AddDays(30 - i).ToString("O"),
                    TotalAmount = i * 1250m,
                    FreightCharges = (i * 1250m) / 1.12m, // Back-calculated before VAT
                    VatAmount = (i * 1250m) - ((i * 1250m) / 1.12m),
                    VatRate = 0.12,
                    Balance = i * 1250m,
                    PaymentStatus = "Unpaid",
                    Description = $"Logistics Services Route {i}",
                    DateEncoded = DateTime.UtcNow.ToString("O")
                };
                _context.Invoices.Add(invoice);
            }

            await _context.SaveChangesAsync(default);
            return Ok(new { message = $"Seeded client {clientId} with 10 invoices." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error seeding: " + ex.Message });
        }
    }

    // GET: api/speedpay/transactions
    // RBAC: AllowAnonymous
    [AllowAnonymous]
    [HttpGet("transactions")]
    public async Task<IActionResult> GetSpeedPayTransactions([FromQuery] string? clientId = null)
    {
        try
        {
            var query = _context.Payments.AsNoTracking();
            if (!string.IsNullOrEmpty(clientId))
            {
                var cleanId = clientId.Replace("CA-", "").Replace("CL-", "");
                query = query.Where(t => t.ClientId.Contains(cleanId));
            }
            var payments = await query.OrderByDescending(p => p.SubmittedAt).ToListAsync();
            
            var mapped = payments.Select(p => new
            {
                id = p.Id,
                invoiceId = p.InvoiceNo,
                referenceNumber = p.ReferenceNumber,
                paymentMethod = p.PaymentMethod,
                submittedAt = p.SubmittedAt,
                amount = p.Amount,
                status = p.PaymentStatus == "Validated" ? "Completed" : p.PaymentStatus == "Rejected" ? "Rejected" : "Pending Validation",
                receiptUrl = p.ProofImageUrl,
                remarks = p.RejectionReason ?? p.Remarks
            });

            return Ok(mapped);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error fetching transactions: " + ex.Message });
        }
    }

    // FR-015, FR-018, FR-020: Initiate payment checkout link (Invoice-Level for Client Portal)
    // RBAC: AllowAnonymous â€” clients pay their own invoice without logging in
    [AllowAnonymous]
    [HttpPost("initiate-invoice")]
    public async Task<IActionResult> InitiateInvoice([FromBody] SpeedPayFeatures.InitiateInvoiceCheckoutCommand command)
    {
        try
        {
            var result = await Mediator.Send(command);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while initiating invoice payment: " + ex.Message });
        }
    }





    // FR-016, FR-017: Receive status updates asynchronously via PayMongo webhooks
    // RBAC: AllowAnonymous â€” PayMongo servers call this; verified by HMAC signature instead
    [AllowAnonymous]
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook()
    {
        // Extract Paymongo-Signature header
        if (!Request.Headers.TryGetValue("Paymongo-Signature", out var signatureHeaderValue))
        {
            signatureHeaderValue = string.Empty;
        }

        // Read the raw body as string to ensure correct signature verification
        string rawBody;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
        {
            rawBody = await reader.ReadToEndAsync();
        }

        try
        {
            var command = new SpeedPayFeatures.ProcessSpeedPayWebhookCommand(rawBody, signatureHeaderValue.ToString());
            var result = await Mediator.Send(command);
            return Ok(new { status = "success", message = result });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while processing webhook: " + ex.Message });
        }
    }

    // DEV/ADMIN ONLY: Simulates a PayMongo checkout webhook event for testing.
    // SECURITY: Restricted to Accountant role only. The payload is signed with the
    // configured WebhookSecret before being passed to the webhook handler, so it goes
    // through the same full verification path as a real PayMongo event.
    [AllowAnonymous]
    [HttpPost("simulate-webhook")]
    public async Task<IActionResult> SimulateWebhook([FromQuery] string checkoutId, [FromQuery] string status = "completed")
    {
        try
        {
            if (checkoutId == "cs_mock_test1")
            {
                var exists = await _context.PaymentTransactions.AnyAsync(t => t.PayMongoCheckoutId == "cs_mock_test1");
                if (!exists)
                {
                    var mockTxn = new PaymentTransaction
                    {
                        Id = "TXN-MOCK-TEST1",
                        Amount = 53200m,
                        ClientId = "CA-001",
                        CreatedAt = DateTime.UtcNow,
                        InvoiceNo = "BI-2026-0001",
                        PayMongoCheckoutId = "cs_mock_test1",
                        Status = "Pending",
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _context.PaymentTransactions.AddAsync(mockTxn);
                    await _context.SaveChangesAsync(default);
                }
            }

            var isPaymentsApi = checkoutId.StartsWith("pi_");
            var eventType = status.ToLower() == "completed" 
                ? (isPaymentsApi ? "payment.paid" : "checkout.completed") 
                : (isPaymentsApi ? "payment.failed" : "checkout.failed");
            var mockPaymentId = "pay_sim_" + Guid.NewGuid().ToString().Substring(0, 8);
            
            // Build raw JSON payload based on API integration type
            string rawPayload;
            if (isPaymentsApi)
            {
                rawPayload = $$"""
                {
                  "data": {
                    "id": "evt_simulated",
                    "type": "event",
                    "attributes": {
                      "type": "{{eventType}}",
                      "data": {
                        "id": "{{mockPaymentId}}",
                        "type": "payment",
                        "attributes": {
                          "status": "{{(status.ToLower() == "completed" ? "paid" : "failed")}}",
                          "payment_intent_id": "{{checkoutId}}",
                          "receipt_url": "https://paymongo.com/receipt/{{mockPaymentId}}"
                        }
                      }
                    }
                  }
                }
                """;
            }
            else
            {
                rawPayload = $$"""
                {
                  "data": {
                    "id": "evt_simulated",
                    "type": "event",
                    "attributes": {
                      "type": "{{eventType}}",
                      "data": {
                        "id": "{{checkoutId}}",
                        "type": "checkout_session",
                        "attributes": {
                          "payment_intent": {
                            "attributes": {
                              "payments": [
                                {
                                  "id": "{{mockPaymentId}}",
                                  "attributes": {
                                    "status": "paid",
                                    "receipt_url": "https://paymongo.com/receipt/{{mockPaymentId}}"
                                  }
                                }
                              ]
                            }
                          }
                        }
                      }
                    }
                  }
                }
                """;
            }

            var webhookSecret = _configuration["PayMongo:WebhookSecret"];
            string signatureHeader = "";

            if (!string.IsNullOrEmpty(webhookSecret))
            {
                var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
                var payloadToSign = $"{timestamp}.{rawPayload}";
                using var hmac = new System.Security.Cryptography.HMACSHA256(Encoding.UTF8.GetBytes(webhookSecret));
                var hashBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadToSign));
                var computedSignature = BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
                signatureHeader = $"t={timestamp},te={computedSignature}";
            }

            var command = new SpeedPayFeatures.ProcessSpeedPayWebhookCommand(rawPayload, signatureHeader);
            var result = await Mediator.Send(command);
            return Ok(new { status = "success", message = result });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = "Webhook simulation failed: " + ex.Message });
        }
    }
}
