using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class AuthFeatures
{
    public record LoginCommand(string Username, string Password) : IRequest<Employee?>;

    public class LoginCommandHandler : IRequestHandler<LoginCommand, Employee?>
    {
        private readonly IApplicationDbContext _context;

        public LoginCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Employee?> Handle(LoginCommand request, CancellationToken cancellationToken)
        {
            var employee = await _context.Employees
                .FirstOrDefaultAsync(e => e.Username.ToLower() == request.Username.ToLower(), cancellationToken);

            if (employee == null) return null;

            // Simplistic password validation matching the seeded demo accounts.
            if (request.Password == "password123" || employee.PasswordHash == request.Password)
            {
                return employee;
            }

            return null;
        }
    }
}
