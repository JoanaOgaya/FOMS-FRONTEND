using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

public class FomsProvisionUserRequest
{
    public string? EmployeeId { get; set; }
    public string? Username { get; set; }
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? Password { get; set; }
    public string? Role { get; set; }
    public string? Phone { get; set; }
    public decimal? SalaryRate { get; set; }
    public DateTime? DateHired { get; set; }
}

public class FomsSyncPasswordRequest
{
    public string EmployeeId { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}

[AllowAnonymous]
[ApiController]
[Route("api/integration/stars")]
public class IntegrationController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<IntegrationController> _logger;

    public IntegrationController(
        IApplicationDbContext context,
        IConfiguration configuration,
        ILogger<IntegrationController> logger)
    {
        _context = context;
        _configuration = configuration;
        _logger = logger;
    }

    private bool IsAuthorized()
    {
        var expectedKey = _configuration["Integration:StarsApiKey"] 
            ?? _configuration["FomsIntegration:ApiKey"]
            ?? _configuration["AppSettings:StarsApiKey"];

        if (string.IsNullOrWhiteSpace(expectedKey))
            return true; // If not configured, allow in development/staging

        if (Request.Headers.TryGetValue("X-Api-Key", out var providedKey))
        {
            return string.Equals(providedKey.ToString().Trim(), expectedKey.Trim(), StringComparison.Ordinal);
        }

        return false;
    }

    [HttpPost("provision-user")]
    public async Task<IActionResult> ProvisionUser([FromBody] FomsProvisionUserRequest request)
    {
        if (!IsAuthorized())
            return Unauthorized(new { success = false, message = "Invalid API Key" });

        if (string.IsNullOrWhiteSpace(request.EmployeeId) && string.IsNullOrWhiteSpace(request.Username))
            return BadRequest(new { success = false, message = "EmployeeId or Username is required" });

        var empId = (request.EmployeeId ?? request.Username ?? "").Trim();
        var username = (request.Username ?? request.EmployeeId ?? "").Trim();
        var email = (request.Email ?? "").Trim();

        var existing = await _context.Employees.FirstOrDefaultAsync(e =>
            e.Id == empId || e.Username == username || (!string.IsNullOrEmpty(email) && e.Email == email));

        if (existing != null)
        {
            if (!string.IsNullOrWhiteSpace(request.Password))
            {
                existing.PasswordHash = AuthService.HashPassword(request.Password);
            }
            if (!string.IsNullOrWhiteSpace(request.FullName))
            {
                existing.Name = request.FullName.Trim();
            }
            if (!string.IsNullOrWhiteSpace(request.Role))
            {
                existing.Role = request.Role.Trim();
            }
            existing.IsActive = true;
            existing.Status = "Active";
            existing.FailedLoginCount = 0;
            existing.LockedAt = null;

            await _context.SaveChangesAsync(default);
            _logger.LogInformation("Updated existing FOMS employee {EmployeeId} ({Username})", empId, username);
            return Ok(new { success = true, message = "Employee updated in FOMS", employeeId = existing.Id });
        }

        var newEmployee = new Employee
        {
            Id = empId,
            Username = username,
            Name = string.IsNullOrWhiteSpace(request.FullName) ? username : request.FullName.Trim(),
            Email = email,
            Role = string.IsNullOrWhiteSpace(request.Role) ? "Accountant" : request.Role.Trim(),
            PasswordHash = string.IsNullOrWhiteSpace(request.Password)
                ? AuthService.HashPassword("Speedex@2026!")
                : AuthService.HashPassword(request.Password),
            IsActive = true,
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        await _context.Employees.AddAsync(newEmployee);
        await _context.SaveChangesAsync(default);

        _logger.LogInformation("Created new FOMS employee {EmployeeId} ({Username})", empId, username);
        return Ok(new { success = true, message = "Employee provisioned to FOMS successfully", employeeId = newEmployee.Id });
    }

    [HttpGet("check-user-exists")]
    public async Task<IActionResult> CheckUserExists([FromQuery] string? email, [FromQuery] string? employeeId)
    {
        if (!IsAuthorized())
            return Unauthorized(new { success = false, message = "Invalid API Key" });

        var cleanEmail = email?.Trim();
        var cleanId = employeeId?.Trim();

        if (!string.IsNullOrEmpty(cleanId))
        {
            var matchId = await _context.Employees.AnyAsync(e => e.Id == cleanId || e.Username == cleanId);
            if (matchId)
                return Ok(new { exists = true, matchedBy = "employeeId" });
        }

        if (!string.IsNullOrEmpty(cleanEmail))
        {
            var matchEmail = await _context.Employees.AnyAsync(e => e.Email.ToLower() == cleanEmail.ToLower());
            if (matchEmail)
                return Ok(new { exists = true, matchedBy = "email" });
        }

        return Ok(new { exists = false });
    }

    [HttpPost("sync-password")]
    public async Task<IActionResult> SyncPassword([FromBody] FomsSyncPasswordRequest request)
    {
        if (!IsAuthorized())
            return Unauthorized(new { success = false, message = "Invalid API Key" });

        if (string.IsNullOrWhiteSpace(request.EmployeeId) || string.IsNullOrWhiteSpace(request.NewPassword))
            return BadRequest(new { success = false, message = "EmployeeId and NewPassword are required" });

        var cleanId = request.EmployeeId.Trim();
        var user = await _context.Employees.FirstOrDefaultAsync(e =>
            e.Id == cleanId || e.Username == cleanId || e.Email.ToLower() == cleanId.ToLower());

        if (user == null)
        {
            return NotFound(new { success = false, message = $"Employee '{cleanId}' not found in FOMS." });
        }

        user.PasswordHash = AuthService.HashPassword(request.NewPassword);
        user.Status = "Active";
        user.IsActive = true;
        user.FailedLoginCount = 0;
        user.LockedAt = null;

        await _context.SaveChangesAsync(default);
        _logger.LogInformation("Synchronized password in FOMS for employee {EmployeeId}", cleanId);

        return Ok(new { success = true, message = "Password synchronized in FOMS successfully." });
    }
}
