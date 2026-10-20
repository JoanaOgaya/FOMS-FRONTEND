using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class TicketFeatures
{
    public record GetTicketsQuery : IRequest<List<SupportTicket>>;

    public class GetTicketsQueryHandler : IRequestHandler<GetTicketsQuery, List<SupportTicket>>
    {
        private readonly IApplicationDbContext _context;

        public GetTicketsQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<SupportTicket>> Handle(GetTicketsQuery request, CancellationToken cancellationToken)
        {
            return await _context.SupportTickets.ToListAsync(cancellationToken);
        }
    }

    public record CreateTicketCommand(
        string ClientName,
        string TicketSubject,
        string Description
    ) : IRequest<SupportTicket>;

    public class CreateTicketCommandHandler : IRequestHandler<CreateTicketCommand, SupportTicket>
    {
        private readonly IApplicationDbContext _context;

        public CreateTicketCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<SupportTicket> Handle(CreateTicketCommand request, CancellationToken cancellationToken)
        {
            var ticket = new SupportTicket
            {
                ClientName = request.ClientName,
                TicketSubject = request.TicketSubject,
                Description = request.Description,
                Status = "Open",
                DateCreated = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),
                LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
            };

            _context.SupportTickets.Add(ticket);
            await _context.SaveChangesAsync(cancellationToken);
            return ticket;
        }
    }

    public record UpdateTicketStatusCommand(
        string Id,
        string Status
    ) : IRequest<bool>;

    public class UpdateTicketStatusCommandHandler : IRequestHandler<UpdateTicketStatusCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public UpdateTicketStatusCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(UpdateTicketStatusCommand request, CancellationToken cancellationToken)
        {
            var ticket = await _context.SupportTickets.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);
            if (ticket == null) return false;

            ticket.Status = request.Status;
            ticket.LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}
