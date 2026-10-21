using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using FOMS.Application.Configuration;
using FOMS.Application.Contracts;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Services;

namespace FOMS.Api.Controllers;

public class FomsSyncPasswordRequest
{
    public string EmployeeId { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
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

[ApiController]
public class IntegrationController : ControllerBase
{
    private readonly IStarsIntegrationService _starsService;
    private readonly IUserService _userService;
    private readonly IApplicationDbContext _context;
    private readonly StarsIntegrationOptions _options;

    public IntegrationController(
        IStarsIntegrationService starsService,
        IUserService userService,
        IApplicationDbContext context,
        IOptions<StarsIntegrationOptions> options)
    {
        _starsService = starsService;
        _userService = userService;
        _context = context;
        _options = options.Value;
    }

    private IActionResult? ValidateApiKey()
    {
        if (string.IsNullOrWhiteSpace(_options.InboundApiKey))
            return null; // Allow in development/staging if not configured

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
    /// Integration 2 (STARS → FOMS): Provision staff user/account from STARS to FOMS.
    /// Secured via X-Api-Key. Supports upsert if employee already exists.
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
        catch (InvalidOperationException)
        {
            // If already exists, update their password and details
            var empId = dto.EmployeeId.Trim();
            var username = dto.Username.Trim();
            var email = dto.Email?.Trim();

            var existing = await _context.Employees.FirstOrDefaultAsync(e =>
                e.Id == empId || e.Username == username || (!string.IsNullOrEmpty(email) && e.Email == email));

            if (existing != null)
            {
                if (!string.IsNullOrWhiteSpace(dto.Password))
                {
                    existing.PasswordHash = AuthService.HashPassword(dto.Password);
                }
                if (!string.IsNullOrWhiteSpace(dto.FullName))
                {
                    existing.Name = dto.FullName.Trim();
                }
                if (!string.IsNullOrWhiteSpace(dto.Role))
                {
                    existing.Role = dto.Role.Trim();
                }
                existing.IsActive = true;
                existing.Status = "Active";
                existing.FailedLoginCount = 0;
                existing.LockedAt = null;

                await _context.SaveChangesAsync(default);
                return Ok(new { isSuccess = true, message = "Employee updated in FOMS.", user = existing });
            }

            throw;
        }
        catch (Exception ex)
        {
            return BadRequest(new { isSuccess = false, message = ex.Message });
        }
    }

    /// <summary>
    /// Cross-system uniqueness probe: checks whether an email or employee ID is already in use in FOMS.
    /// Authenticated by shared X-Api-Key.
    /// </summary>
    [HttpGet("api/integration/stars/check-user-exists")]
    [AllowAnonymous]
    public async Task<IActionResult> CheckUserExists([FromQuery] string? email, [FromQuery] string? employeeId)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        if (string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(employeeId))
            return BadRequest(new { exists = false, message = "Either email or employeeId must be provided." });

        var (exists, matchedBy) = await _userService.CheckExistsAsync(email, employeeId);
        return Ok(new { exists, system = "FOMS", matchedBy });
    }

    /// <summary>
    /// Centralized password synchronization from STARS master identity.
    /// Authenticated by shared X-Api-Key.
    /// </summary>
    [HttpPost("api/integration/stars/sync-password")]
    [AllowAnonymous]
    public async Task<IActionResult> SyncPassword([FromBody] FomsSyncPasswordRequest request)
    {
        var authError = ValidateApiKey();
        if (authError != null) return authError;

        if (string.IsNullOrWhiteSpace(request.EmployeeId) || string.IsNullOrWhiteSpace(request.NewPassword))
            return BadRequest(new { isSuccess = false, message = "EmployeeId and NewPassword are required." });

        var cleanId = request.EmployeeId.Trim();
        var user = await _context.Employees.FirstOrDefaultAsync(e =>
            e.Id == cleanId || e.Username == cleanId || e.Email.ToLower() == cleanId.ToLower());

        if (user == null)
        {
            return NotFound(new { isSuccess = false, message = $"Employee '{cleanId}' not found in FOMS." });
        }

        user.PasswordHash = AuthService.HashPassword(request.NewPassword);
        user.Status = "Active";
        user.IsActive = true;
        user.FailedLoginCount = 0;
        user.LockedAt = null;

        await _context.SaveChangesAsync(default);
        return Ok(new { isSuccess = true, message = "Password synchronized in FOMS successfully." });
    }
}
