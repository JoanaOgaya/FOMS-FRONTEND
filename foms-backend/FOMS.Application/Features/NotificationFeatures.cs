using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class NotificationFeatures
{
    public record GetNotificationsQuery : IRequest<List<Notification>>;

    public class GetNotificationsQueryHandler : IRequestHandler<GetNotificationsQuery, List<Notification>>
    {
        private readonly IApplicationDbContext _context;

        public GetNotificationsQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<Notification>> Handle(GetNotificationsQuery request, CancellationToken cancellationToken)
        {
            return await _context.Notifications.ToListAsync(cancellationToken);
        }
    }

    public record MarkNotificationReadCommand(string Id) : IRequest<bool>;

    public class MarkNotificationReadCommandHandler : IRequestHandler<MarkNotificationReadCommand, bool>
    {
        private readonly IApplicationDbContext _context;

        public MarkNotificationReadCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<bool> Handle(MarkNotificationReadCommand request, CancellationToken cancellationToken)
        {
            var notification = await _context.Notifications.FirstOrDefaultAsync(n => n.Id == request.Id, cancellationToken);
            if (notification == null) return false;

            notification.Read = true;
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}
