using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Application.Features;

public static class LogFeatures
{
    public record GetLogsQuery : IRequest<List<ActivityLog>>;

    public class GetLogsQueryHandler : IRequestHandler<GetLogsQuery, List<ActivityLog>>
    {
        private readonly IApplicationDbContext _context;

        public GetLogsQueryHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<ActivityLog>> Handle(GetLogsQuery request, CancellationToken cancellationToken)
        {
            return await _context.ActivityLogs.ToListAsync(cancellationToken);
        }
    }

    public record CreateLogCommand(
        string UserName,
        string UserRole,
        string UserInitials,
        string UserColor,
        string Action,
        string Description,
        string? Reference
    ) : IRequest<ActivityLog>;

    public class CreateLogCommandHandler : IRequestHandler<CreateLogCommand, ActivityLog>
    {
        private readonly IApplicationDbContext _context;

        public CreateLogCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<ActivityLog> Handle(CreateLogCommand request, CancellationToken cancellationToken)
        {
            var log = new ActivityLog
            {
                UserName = request.UserName,
                UserRole = request.UserRole,
                UserInitials = request.UserInitials,
                UserColor = request.UserColor,
                Action = request.Action,
                Description = request.Description,
                Reference = request.Reference,
                Timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss") // standard format
            };

            _context.ActivityLogs.Add(log);
            await _context.SaveChangesAsync(cancellationToken);
            return log;
        }
    }
}
