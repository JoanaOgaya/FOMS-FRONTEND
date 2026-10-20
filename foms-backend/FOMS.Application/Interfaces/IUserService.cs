using System.Collections.Generic;
using System.Threading.Tasks;
using FOMS.Application.DTOs;

namespace FOMS.Application.Interfaces;

public interface IUserService
{
    Task<IEnumerable<UserDto>> GetAllAsync();
    Task<UserDto?> GetByIdAsync(string id);
    Task<UserDto> CreateAsync(UserCreateDto request);
    Task<UserDto?> UpdateAsync(string id, UserUpdateDto request);
    Task<bool> DeleteAsync(string id);
    Task<IEnumerable<RoleDto>> GetRolesAsync();
    Task<RoleDto> CreateRoleAsync(RoleCreateDto request);
}
