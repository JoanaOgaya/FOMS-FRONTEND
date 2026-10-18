using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using FOMS.Application.Configuration;
using FOMS.Application.Contracts;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;
using FOMS.Infrastructure.Services;

namespace FOMS.Api.Controllers;

[ApiController]
public class IntegrationController : ControllerBase
{
    private readonly IStarsIntegrationService _starsService;
    private readonly IUserService _userService;
    private readonly StarsIntegrationOptions _options;

    public IntegrationController(
        IStarsIntegrationService starsService,
        IUserService userService,
        IOptions<StarsIntegrationOptions> options)
    {
        _starsService = starsService;
        _userService = userService;
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

    /// <summary>
    /// Integration 2 (STARS → FOMS): Provision staff user/account from STARS to FOMS.
    /// Secured via X-Api-Key.
    /// </summary>
    [HttpPost("api/integration/stars/provision-user")]
    [AllowAnonymous]
    public async Task<IActionResult> ProvisionUser([FromBody] StarsProvisionUserDto dto)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        if (string.IsNullOrWhiteSpace(dto.EmployeeId) || string.IsNullOrWhiteSpace(dto.Username))
            return BadRequest(new { isSuccess = false, message = "EmployeeId and Username are required." });

        try
        {
            var user = await _userService.CreateAsync(new UserCreateDto
            {
                EmployeeId = dto.EmployeeId,
                Username = dto.Username,
                FullName = !string.IsNullOrWhiteSpace(dto.FullName) ? dto.FullName : dto.Username,
                Email = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email : $"{dto.Username.ToLower()}@speedex.com",
                Password = !string.IsNullOrWhiteSpace(dto.Password) ? dto.Password : "Password@123",
                Role = !string.IsNullOrWhiteSpace(dto.Role) ? dto.Role : "Accountant",
                Phone = dto.Phone,
                SalaryRate = dto.SalaryRate,
                DateHired = dto.DateHired
            });

            return Ok(new { isSuccess = true, message = "User provisioned successfully into FOMS.", user });
        }
        catch (Exception ex)
        {
            return BadRequest(new { isSuccess = false, message = ex.Message });
        }
    }
}

public class StarsProvisionUserDto
{
    public string EmployeeId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? Password { get; set; }
    public string? Role { get; set; }
    public string? Phone { get; set; }
    public decimal? SalaryRate { get; set; }
    public DateTime? DateHired { get; set; }
}
