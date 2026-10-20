using System;
using System.ComponentModel.DataAnnotations;

namespace FOMS.Application.DTOs;

public class AuthResultDto
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public UserDto User { get; set; } = new UserDto();
}

public class LoginRequestDto
{
    public string? Username { get; set; }
    public string? EmployeeNumber { get; set; }
    public string? EmployeeId { get; set; }
    public string Password { get; set; } = string.Empty;

    public string GetIdentifier()
    {
        if (!string.IsNullOrWhiteSpace(EmployeeNumber)) return EmployeeNumber.Trim();
        if (!string.IsNullOrWhiteSpace(Username)) return Username.Trim();
        if (!string.IsNullOrWhiteSpace(EmployeeId)) return EmployeeId.Trim();
        return string.Empty;
    }
}

public class RefreshRequestDto
{
    [Required(ErrorMessage = "RefreshToken is required.")]
    public string RefreshToken { get; set; } = string.Empty;
}

public class ChangePasswordDto
{
    [Required(ErrorMessage = "Current password is required.")]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "New password is required.")]
    [MinLength(8, ErrorMessage = "New password must be at least 8 characters.")]
    public string NewPassword { get; set; } = string.Empty;
}
