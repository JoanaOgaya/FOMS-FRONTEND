using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Services;

public class UserService : IUserService
{
    private readonly IApplicationDbContext _context;
    private readonly IStarsIntegrationService? _starsService;

    public UserService(IApplicationDbContext context, IStarsIntegrationService? starsService = null)
    {
        _context = context;
        _starsService = starsService;
    }

    public async Task<UserDto> CreateAsync(UserCreateDto request)
    {
        // 1. Check local email uniqueness
        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var emailLower = request.Email.Trim().ToLowerInvariant();
            if (await _context.Employees.AnyAsync(e => e.Email.ToLower() == emailLower))
            {
                throw new InvalidOperationException($"Email '{request.Email}' is already registered in FOMS. Each email must exist only once.");
            }
        }

        // 2. Check local username / employee ID uniqueness
        if (!string.IsNullOrWhiteSpace(request.Username))
        {
            var usernameLower = request.Username.Trim().ToLowerInvariant();
            if (await _context.Employees.AnyAsync(e => e.Username.ToLower() == usernameLower || e.Id.ToLower() == usernameLower))
            {
                throw new InvalidOperationException($"Username or Employee ID '{request.Username}' is already registered in FOMS.");
            }
        }

        // 3. Cross-system check against STARS
        if (_starsService != null && _starsService.IsConfigured && !string.IsNullOrWhiteSpace(request.Email))
        {
            var (existsInStars, starsMsg) = await _starsService.CheckUserExistsInStarsAsync(request.Email, request.EmployeeId);
            if (existsInStars)
            {
                throw new InvalidOperationException($"This email is already in use by an existing STARS account. Each email must be unique across Speedex.");
            }
        }

        var role = await EnsureRoleExistsAsync(request.Role);
        var empId = !string.IsNullOrWhiteSpace(request.EmployeeId) ? request.EmployeeId.Trim() : request.Username.Trim();
        var user = new Employee
        {
            Id = empId,
            Username = request.Username.Trim(),
            Name = request.FullName.Trim(),
            Email = request.Email.Trim().ToLowerInvariant(),
            Role = role.Name,
            RoleId = role.Id,
            Phone = request.Phone?.Trim(),
            SalaryRate = request.SalaryRate,
            DateHired = request.DateHired ?? DateTime.UtcNow,
            IsActive = true,
            Status = "Active",
            SystemAccess = "Finance Operation Service",
            CreatedAt = DateTime.UtcNow,
            PasswordHash = AuthService.HashPassword(request.Password)
        };

        await _context.Employees.AddAsync(user);
        await _context.SaveChangesAsync(default);

        return new UserDto
        {
            Id = user.Id,
            EmployeeNumber = user.Id,
            Username = user.Username,
            FullName = user.Name,
            Email = user.Email,
            Role = user.Role,
            RoleId = user.RoleId,
            Phone = user.Phone,
            SalaryRate = user.SalaryRate,
            Status = user.Status,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            DateHired = user.DateHired
        };
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var existing = await _context.Employees.FindAsync(id);
        if (existing == null)
            return false;

        _context.Employees.Remove(existing);
        await _context.SaveChangesAsync(default);
        return true;
    }

    public async Task<IEnumerable<UserDto>> GetAllAsync()
    {
        return await _context.Employees
            .AsNoTracking()
            .Select(user => new UserDto
            {
                Id = user.Id,
                EmployeeNumber = user.Id,
                Username = user.Username,
                FullName = user.Name,
                Email = user.Email,
                Role = user.Role,
                RoleId = user.RoleId,
                Phone = user.Phone,
                SalaryRate = user.SalaryRate,
                Status = user.Status,
                IsActive = user.IsActive,
                CreatedAt = user.CreatedAt,
                DateHired = user.DateHired
            })
            .ToListAsync();
    }

    public async Task<UserDto?> GetByIdAsync(string id)
    {
        var user = await _context.Employees.FindAsync(id);
        if (user == null)
            return null;

        return new UserDto
        {
            Id = user.Id,
            EmployeeNumber = user.Id,
            Username = user.Username,
            FullName = user.Name,
            Email = user.Email,
            Role = user.Role,
            RoleId = user.RoleId,
            Phone = user.Phone,
            SalaryRate = user.SalaryRate,
            Status = user.Status,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            DateHired = user.DateHired
        };
    }

    public async Task<IEnumerable<RoleDto>> GetRolesAsync()
    {
        return await _context.Roles
            .AsNoTracking()
            .Select(role => new RoleDto
            {
                Id = role.Id,
                Name = role.Name,
                Description = role.Description
            })
            .ToListAsync();
    }

    public async Task<RoleDto> CreateRoleAsync(RoleCreateDto request)
    {
        var role = new Role
        {
            Name = request.Name,
            Description = request.Description
        };

        await _context.Roles.AddAsync(role);
        await _context.SaveChangesAsync(default);

        return new RoleDto
        {
            Id = role.Id,
            Name = role.Name,
            Description = role.Description
        };
    }

    public async Task<UserDto?> UpdateAsync(string id, UserUpdateDto request)
    {
        var existing = await _context.Employees.FindAsync(id);
        if (existing == null)
            return null;

        existing.Name = request.FullName.Trim();
        existing.Email = request.Email.Trim().ToLowerInvariant();
        existing.IsActive = request.IsActive;
        existing.Role = request.Role;
        existing.Phone = request.Phone?.Trim();
        existing.SalaryRate = request.SalaryRate;
        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            existing.Status = request.Status;
        }

        var role = await EnsureRoleExistsAsync(request.Role);
        existing.RoleId = role.Id;

        _context.Employees.Update(existing);
        await _context.SaveChangesAsync(default);

        return new UserDto
        {
            Id = existing.Id,
            EmployeeNumber = existing.Id,
            Username = existing.Username,
            FullName = existing.Name,
            Email = existing.Email,
            Role = existing.Role,
            RoleId = existing.RoleId,
            Phone = existing.Phone,
            SalaryRate = existing.SalaryRate,
            Status = existing.Status,
            IsActive = existing.IsActive,
            CreatedAt = existing.CreatedAt,
            DateHired = existing.DateHired
        };
    }

    private async Task<Role> EnsureRoleExistsAsync(string roleName)
    {
        var existing = await _context.Roles.FirstOrDefaultAsync(r => r.Name == roleName);
        if (existing != null)
            return existing;

        var role = new Role { Name = roleName, Description = roleName };
        await _context.Roles.AddAsync(role);
        await _context.SaveChangesAsync(default);
        return role;
    }

    public async Task<(bool exists, string matchedBy)> CheckExistsAsync(string? email, string? employeeId)
    {
        if (!string.IsNullOrWhiteSpace(email))
        {
            var emailLower = email.Trim().ToLowerInvariant();
            if (await _context.Employees.AnyAsync(e => e.Email.ToLower() == emailLower))
                return (true, "email");
        }

        if (!string.IsNullOrWhiteSpace(employeeId))
        {
            var empLower = employeeId.Trim().ToLowerInvariant();
            if (await _context.Employees.AnyAsync(e => e.Id.ToLower() == empLower || e.Username.ToLower() == empLower))
                return (true, "employeeId");
        }

        return (false, "none");
    }
}
