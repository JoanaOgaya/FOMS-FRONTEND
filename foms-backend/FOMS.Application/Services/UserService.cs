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

    public UserService(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<UserDto> CreateAsync(UserCreateDto request)
    {
        var role = await EnsureRoleExistsAsync(request.Role);
        var user = new Employee
        {
            Username = request.Username,
            Name = request.FullName,
            Email = request.Email,
            Role = role.Name,
            RoleId = role.Id,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            PasswordHash = AuthService.HashPassword(request.Password)
        };

        await _context.Employees.AddAsync(user);
        await _context.SaveChangesAsync(default);

        return new UserDto
        {
            Id = user.Id,
            Username = user.Username,
            FullName = user.Name,
            Email = user.Email,
            Role = user.Role,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt
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
                Username = user.Username,
                FullName = user.Name,
                Email = user.Email,
                Role = user.Role,
                IsActive = user.IsActive,
                CreatedAt = user.CreatedAt
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
            Username = user.Username,
            FullName = user.Name,
            Email = user.Email,
            Role = user.Role,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt
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

        existing.Name = request.FullName;
        existing.Email = request.Email;
        existing.IsActive = request.IsActive;
        existing.Role = request.Role;

        var role = await EnsureRoleExistsAsync(request.Role);
        existing.RoleId = role.Id;

        _context.Employees.Update(existing);
        await _context.SaveChangesAsync(default);

        return new UserDto
        {
            Id = existing.Id,
            Username = existing.Username,
            FullName = existing.Name,
            Email = existing.Email,
            Role = existing.Role,
            IsActive = existing.IsActive,
            CreatedAt = existing.CreatedAt
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
}
