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
        var key = Request.Headers[StarsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(key))
        {
            if (!string.IsNullOrWhiteSpace(_options.InboundApiKey) &&
                !StarsIntegrationService.ValidateApiKey(key, _options.InboundApiKey))
            {
                return Unauthorized(new { message = "Invalid API key." });
            }
        }
        return null;
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

    /// <summary>
    /// STARS Collection Workflow (Item 4 & 5): Intercepts payload and automatically creates a "Collection Follow-up" task.
    /// STARS Graph Routing Engine evaluates finance team workload/availability and routes task to optimal Coordinator.
    /// </summary>
    [HttpPost("api/integration/stars/collection-task")]
    [AllowAnonymous]
    public async Task<IActionResult> CreateCollectionTask([FromBody] StarsCollectionTaskRequestDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var (isSuccess, message, data) = await _starsService.CreateCollectionFollowUpTaskAsync(dto);
        return isSuccess ? Ok(new { isSuccess, message, data }) : BadRequest(new { isSuccess, message });
    }

    /// <summary>
    /// STARS Collection Workflow (Item 6): Coordinator executes collection follow-up workflow inside STARS.
    /// </summary>
    [HttpPost("api/integration/stars/collection-task/{taskId}/execute")]
    [AllowAnonymous]
    public async Task<IActionResult> ExecuteCollectionTask(int taskId, [FromBody] StarsCollectionExecutionDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var (isSuccess, message, data) = await _starsService.ExecuteCollectionTaskAsync(taskId, dto);
        return isSuccess ? Ok(new { isSuccess, message, data }) : BadRequest(new { isSuccess, message });
    }

    /// <summary>
    /// Retrieves collection follow-up tasks recorded by STARS.
    /// </summary>
    [HttpGet("api/integration/stars/collection-tasks")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCollectionTasks([FromQuery] string? status)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var tasks = await _starsService.GetCollectionTasksAsync(status);
        return Ok(tasks);
    }

    /// <summary>
    /// STARS Graph Routing Engine: Returns real-time coordinator workload and availability routing metrics.
    /// </summary>
    [HttpGet("api/integration/stars/routing-metrics")]
    [AllowAnonymous]
    public async Task<IActionResult> GetRoutingMetrics()
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var metrics = await _starsService.EvaluateCoordinatorGraphRoutingAsync();
        return Ok(metrics);
    }
}
