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
public class DmsIntegrationController : ControllerBase
{
    private readonly IDmsIntegrationService _dmsService;
    private readonly DmsIntegrationOptions _options;

    public DmsIntegrationController(
        IDmsIntegrationService dmsService,
        IOptions<DmsIntegrationOptions> options)
    {
        _dmsService = dmsService;
        _options = options.Value;
    }

    private IActionResult? ValidateApiKey()
    {
        if (string.IsNullOrWhiteSpace(_options.InboundApiKey))
            return StatusCode(503, new { message = "DMS integration is not configured on this server." });

        var key = Request.Headers[DmsIntegrationService.ApiKeyHeaderName].FirstOrDefault();
        return DmsIntegrationService.ValidateApiKey(key, _options.InboundApiKey)
            ? null
            : Unauthorized(new { message = "Invalid or missing API key." });
    }

    /// <summary>
    /// Integration 1 (DMS → FOMS): Delivery marked Completed after POD validation.
    /// Creates waybill, validates POD, calculates billing, creates Invoice, and records AR.
    /// </summary>
    [HttpPost("api/integration/dms/delivery-completed")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveDeliveryCompleted([FromBody] DmsDeliveryCompletedDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessDeliveryCompletedAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 2 (DMS → FOMS - Trigger A): Driver records a failed delivery in DMS.
    /// Places a Billing Hold in FOMS preventing invoice creation per FR-013.
    /// </summary>
    [HttpPost("api/integration/dms/delivery-failed")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveDeliveryFailed([FromBody] DmsDeliveryFailedDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessDeliveryFailedAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 2 (DMS → FOMS - Trigger B): Successful redelivery update.
    /// Lifts Billing Hold in FOMS and resumes invoice processing per FR-022.
    /// </summary>
    [HttpPost("api/integration/dms/delivery-redelivered")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveRedeliveryCompleted([FromBody] DmsRedeliveryCompletedDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessRedeliveryCompletedAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 3 (DMS → FOMS - Trigger A): Operations Team requests a trip cash advance.
    /// Finance approves and records cash outflow per FR-043/050.
    /// </summary>
    [HttpPost("api/integration/dms/cash-advance-request")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveCashAdvanceRequest([FromBody] DmsCashAdvanceRequestDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessCashAdvanceRequestAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Integration 3 (DMS → FOMS - Trigger B): Operations Team submits post-trip liquidation & receipts.
    /// FOMS validates receipts, reconciles leftover cash, and marks liquidated per FR-048–053.
    /// </summary>
    [HttpPost("api/integration/dms/liquidation-submission")]
    [AllowAnonymous]
    public async Task<IActionResult> ReceiveLiquidationSubmission([FromBody] DmsLiquidationSubmissionDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        var result = await _dmsService.ProcessLiquidationSubmissionAsync(dto);
        return result.IsSuccess ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Look up waybill status, POD, and billing details.
    /// </summary>
    [HttpGet("api/integration/dms/waybills/{waybillNo}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetWaybillStatus(string waybillNo)
    {
        var authError = ValidateApiKey();
        if (authError != null && User.Identity?.IsAuthenticated != true)
            return authError;

        var result = await _dmsService.GetWaybillStatusAsync(waybillNo);
        return result != null ? Ok(result) : NotFound(new { message = $"Waybill '{waybillNo}' not found in FOMS." });
    }
}
