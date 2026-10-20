using System;

namespace FOMS.Domain.Entities;

public class ActivityLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Timestamp { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string UserRole { get; set; } = string.Empty;
    public string UserInitials { get; set; } = string.Empty;
    public string UserColor { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? Reference { get; set; }
}
