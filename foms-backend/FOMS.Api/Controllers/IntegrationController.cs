using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using FOMS.Application.Configuration;
using FOMS.Application.Contracts;
using FOMS.Application.Interfaces;
using FOMS.Infrastructure.Services;

namespace FOMS.Api.Controllers;

[ApiController]
public class IntegrationController : ControllerBase
{
    private readonly IStarsIntegrationService _starsService;
    private readonly StarsIntegrationOptions _options;

    public IntegrationController(
        IStarsIntegrationService starsService,
        IOptions<StarsIntegrationOptions> options)
    {
        _starsService = starsService;
        _options = options.Value;
    }

    private IActionResult? ValidateApiKey()
    {
        if (string.IsNullOrWhiteSpace(_options.InboundApiKey))
            return StatusCode(503, new { message = "STARS integration is not configured on this server." });

        var key = Request.Headers[StarsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        return StarsIntegrationService.ValidateApiKey(key, _options.InboundApiKey)
            ? null
            : Unauthorized(new { message = "Invalid or missing API key." });
    }

    // ─── Machine-to-Machine Endpoints (API Key Guarded) ──────────────────────

    /// <summary>
    /// Integration 1 (STARS → FOMS): STARS pushes client signed endorsement copy and actual received date.
    /// FOMS automatically calculates the 30-day payment term due date per FR-028.
    /// </summary>
    [HttpPost("api/integration/stars/invoice-endorsed")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveEndorsementCompletion([FromBody] StarsEndorsementCompletionDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var (isSuccess, message) = await _starsService.ProcessEndorsementCompletionAsync(dto);
        return isSuccess ? Ok(new { isSuccess, message }) : BadRequest(new { isSuccess, message });
    }

    /// <summary>
    /// Integration 1 (FOMS → STARS trigger): Finalized invoice is pushed to STARS to create an endorsement delivery task.
    /// Can be invoked by STARS (M2M with API key) or internal staff.
    /// </summary>
    [HttpPost("api/integration/stars/trigger-endorsement/{invoiceNo}")]
    [AllowAnonymous]
    public async Task<IActionResult> TriggerEndorsement(string invoiceNo, [FromQuery] string? remarks)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var (isSuccess, message, data) = await _starsService.RequestInvoiceEndorsementAsync(invoiceNo, remarks);
        return isSuccess ? Ok(new { isSuccess, message, data }) : BadRequest(new { isSuccess, message });
    }

    /// <summary>
    /// Integration 2 (FOMS → STARS trigger): Pushes invoice and payment status updates to STARS.
    /// </summary>
    [HttpPost("api/integration/stars/trigger-status-sync/{invoiceNo}")]
    [AllowAnonymous]
    public async Task<IActionResult> TriggerStatusSync(string invoiceNo)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var (isSuccess, message) = await _starsService.NotifyPaymentStatusChangeAsync(invoiceNo);
        return isSuccess ? Ok(new { isSuccess, message }) : BadRequest(new { isSuccess, message });
    }

    /// <summary>
    /// Integration 3 (FOMS → STARS trigger): Pushes overdue account alert to STARS for collection routing.
    /// </summary>
    [HttpPost("api/integration/stars/trigger-overdue-alert/{invoiceNo}")]
    [AllowAnonymous]
    public async Task<IActionResult> TriggerOverdueAlert(string invoiceNo)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var (isSuccess, message) = await _starsService.SendOverdueAlertAsync(invoiceNo);
        return isSuccess ? Ok(new { isSuccess, message }) : BadRequest(new { isSuccess, message });
    }

    /// <summary>
    /// Retrieves the STARS endorsement link record for a specific invoice.
    /// </summary>
    [HttpGet("api/integration/stars/links/{invoiceNo}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetEndorsementLink(string invoiceNo)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var link = await _starsService.GetEndorsementLinkAsync(invoiceNo);
        return link != null ? Ok(link) : NotFound(new { message = $"No endorsement link found for invoice '{invoiceNo}'." });
    }
}
