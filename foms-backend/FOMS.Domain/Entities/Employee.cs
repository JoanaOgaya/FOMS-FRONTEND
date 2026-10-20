using System;
using System.Collections.Generic;

namespace FOMS.Domain.Entities;

/// <summary>
/// Represents a FOMS system user (Bookkeeper, Accountant, Payroll Officer, Cashier).
/// </summary>
public class Employee
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = "Employee";
    public string? RoleId { get; set; }
    public Role? RoleNavigation { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string SystemAccess { get; set; } = "Granted";

    /// <summary>
    /// Account status: "Active" | "Pending" | "Locked"
    /// </summary>
    public string Status { get; set; } = "Active";

    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Password stored as PBKDF2 hash only. Format: PBKDF2$iterations$salt$hash
    /// Plaintext passwords are NEVER stored.
    /// </summary>
    public string PasswordHash { get; set; } = string.Empty;

    // ── PHASE 1: Account Lockout Fields ────────────────────────────────────────

    /// <summary>
    /// Number of consecutive failed login attempts since last successful login.
    /// Automatically reset to 0 on successful login.
    /// Account locks when this reaches 5.
    /// </summary>
    public int FailedLoginCount { get; set; } = 0;

    /// <summary>
    /// UTC timestamp when the account was locked due to too many failed attempts.
    /// Null means the account has never been locked.
    /// Only an Accountant can unlock a locked account via POST /api/auth/unlock/{userId}.
    /// </summary>
    public DateTime? LockedAt { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
