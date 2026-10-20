using FOMS.Application.Features;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;

namespace FOMS.Api.Controllers;

[AllowAnonymous] // Webhooks must be accessible without authentication
[ApiController]
[Route("api/webhooks/paymongo")]
public class PaymongoWebhookController : ControllerBase
{
    private readonly ISender _mediator;
    private readonly ILogger<PaymongoWebhookController> _logger;

    public PaymongoWebhookController(ISender mediator, ILogger<PaymongoWebhookController> logger)
    {
        _mediator = mediator;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> HandleWebhook()
    {
        // 1. Read Raw Body
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var rawBody = await reader.ReadToEndAsync();

        // 2. Extract Header
        if (!Request.Headers.TryGetValue("Paymongo-Signature", out var signatureHeaderValues))
        {
            _logger.LogWarning("Missing Paymongo-Signature header.");
            return BadRequest("Missing Signature");
        }

        var signatureHeader = signatureHeaderValues.ToString();

        // 3. Process the Event using your existing MediatR CQRS Architecture
        // Your project actually ALREADY has a very robust "ProcessSpeedPayWebhookCommand".
        // Instead of writing a completely new database update logic from scratch, we can
        // just pass the webhook directly into your existing architecture!
        // This command automatically handles:
        // - Cryptographic Signature validation
        // - Preventing duplicate processing (Replay attacks)
        // - Finding the corresponding Invoice and deducting the balance
        // - Creating Payment Collections & Official Receipts automatically
        // - Adding an AuditLog entry
        try
        {
            var command = new SpeedPayFeatures.ProcessSpeedPayWebhookCommand(rawBody, signatureHeader);
            var result = await _mediator.Send(command);
            
            _logger.LogInformation("Webhook processed successfully: {Result}", result);
            return Ok(new { status = "success", message = result });
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning("PayMongo signature validation failed: {Message}", ex.Message);
            return Unauthorized(new { message = "Invalid Signature" });
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning("Webhook payload invalid: {Message}", ex.Message);
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "An error occurred while processing the PayMongo webhook.");
            return StatusCode(500, new { message = "Internal server error" });
        }
    }
}
