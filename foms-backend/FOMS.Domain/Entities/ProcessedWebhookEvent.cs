using System;

namespace FOMS.Domain.Entities;

/// <summary>
/// Stores IDs of PayMongo webhook events that have already been processed.
/// Used to prevent replay attacks — any event ID seen before is immediately rejected.
/// </summary>
public class ProcessedWebhookEvent
{
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>
    /// The unique event ID from the PayMongo webhook payload (data.id).
    /// Has a UNIQUE database index — duplicate inserts will throw, preventing races.
    /// </summary>
    public string EventId { get; set; } = string.Empty;

    /// <summary>
    /// UTC timestamp when this event was first received and processed.
    /// </summary>
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}
