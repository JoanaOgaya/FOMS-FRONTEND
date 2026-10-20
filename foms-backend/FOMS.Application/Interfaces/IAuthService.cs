using System.Threading.Tasks;
using FOMS.Application.DTOs;

namespace FOMS.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResultDto> LoginAsync(string username, string password);
    Task<AuthResultDto> RefreshTokenAsync(string refreshToken);
    Task<bool> LogoutAsync(string refreshToken);
    Task<UserDto?> GetProfileAsync(string userId);

    /// <summary>
    /// Changes the password for an authenticated user.
    /// Requires the current password to be correct before accepting the new one.
    /// </summary>
    Task<bool> ChangePasswordAsync(string userId, string currentPassword, string newPassword);

    /// <summary>
    /// Unlocks a locked employee account.
    /// Can only be called by a user with the Accountant role.
    /// Resets FailedLoginCount and Status back to Active.
    /// </summary>
    Task<bool> UnlockAccountAsync(string targetUserId, string adminUserId);
}
