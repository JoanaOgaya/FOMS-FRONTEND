using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class ClientFeatures
{
    public record GetClientsQuery : IRequest<List<Client>>;

    public class GetClientsQueryHandler : IRequestHandler<GetClientsQuery, List<Client>>
    {
        private readonly IApplicationDbContext _context;

        public GetClientsQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<Client>> Handle(GetClientsQuery request, CancellationToken cancellationToken)
        {
            return await _context.Clients.ToListAsync(cancellationToken);
        }
    }

    public record CreateClientCommand(
        string ClientCode,
        string Name,
        string BusinessName,
        string ContactPerson,
        string ContactNumber,
        string Email,
        string Address,
        string? Tin,
        decimal CreditLimit
    ) : IRequest<Client>;

    public class CreateClientCommandHandler : IRequestHandler<CreateClientCommand, Client>
    {
        private readonly IApplicationDbContext _context;

        public CreateClientCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Client> Handle(CreateClientCommand request, CancellationToken cancellationToken)
        {
            var code = request.ClientCode;
            if (string.IsNullOrWhiteSpace(code))
            {
                var name = (request.Name ?? "").ToLowerInvariant();
                string prefix = "CLI";
                if (name.Contains("lazada")) prefix = "LZD";
                else if (name.Contains("shopee")) prefix = "SHP";
                else if (name.Contains("tiktok")) prefix = "TKT";
                else if (name.Contains("zalora")) prefix = "ZAL";
                else if (name.Contains("test")) prefix = "TST";
                else if (!string.IsNullOrWhiteSpace(request.Name))
                {
                    var cleanLetters = new string(request.Name.Where(char.IsLetter).ToArray());
                    prefix = cleanLetters.Length >= 3 ? cleanLetters[..3].ToUpperInvariant() : "CLI";
                }

                var count = await _context.Clients.CountAsync(c => c.ClientCode.StartsWith(prefix), cancellationToken);
                code = $"{prefix}-{(count + 1):D3}";
            }

            var client = new Client
            {
                Id = code,
                ClientCode = code,
                Name = request.Name,
                BusinessName = request.BusinessName,
                ContactPerson = request.ContactPerson,
                ContactNumber = request.ContactNumber,
                Email = request.Email,
                Address = request.Address,
                Tin = request.Tin,
                CreditLimit = request.CreditLimit,
                CurrentBalance = 0,
                TotalBilled = 0,
                TotalPaid = 0,
                Status = "Active",
                DateRegistered = DateTime.UtcNow.ToString("MMM dd, yyyy"),
                LastTransaction = "—",
                Archived = false
            };

            _context.Clients.Add(client);
            await _context.SaveChangesAsync(cancellationToken);
            return client;
        }
    }

    public record DeleteClientCommand(string Id) : IRequest<bool>;

    public class DeleteClientCommandHandler : IRequestHandler<DeleteClientCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public DeleteClientCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(DeleteClientCommand request, CancellationToken cancellationToken)
        {
            var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken);
            if (client == null) return false;

            _context.Clients.Remove(client);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }

    public record ArchiveClientCommand(string Id, bool Archived) : IRequest<bool>;

    public class ArchiveClientCommandHandler : IRequestHandler<ArchiveClientCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public ArchiveClientCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(ArchiveClientCommand request, CancellationToken cancellationToken)
        {
            var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken);
            if (client == null) return false;

            client.Archived = request.Archived;
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
    public record UpdateClientCommand(
        string Id,
        string ClientCode,
        string Name,
        string BusinessName,
        string ContactPerson,
        string ContactNumber,
        string Email,
        string Address,
        string? Tin,
        decimal CreditLimit
    ) : IRequest<Client?>;

    public class UpdateClientCommandHandler : IRequestHandler<UpdateClientCommand, Client?>
    {
        private readonly IApplicationDbContext _context;

        public UpdateClientCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Client?> Handle(UpdateClientCommand request, CancellationToken cancellationToken)
        {
            var client = await _context.Clients.FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken);
            if (client == null) return null;

            client.ClientCode = request.ClientCode;
            client.Name = request.Name;
            client.BusinessName = request.BusinessName;
            client.ContactPerson = request.ContactPerson;
            client.ContactNumber = request.ContactNumber;
            client.Email = request.Email;
            client.Address = request.Address;
            client.Tin = request.Tin;
            client.CreditLimit = request.CreditLimit;

            await _context.SaveChangesAsync(cancellationToken);
            return client;
        }
    }
}
