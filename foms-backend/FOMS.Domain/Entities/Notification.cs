using System;

namespace FOMS.Domain.Entities;

public class Notification
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Type { get; set; } = "info"; // "alert" | "success" | "system" | "info"
    public string Title { get; set; } = string.Empty;
    public string? InvoiceNo { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public bool Read { get; set; }
    public string? StatusBadge { get; set; }

    // Validation Flow Properties
    public string? RecipientUserId { get; set; }
    public string? RecipientRole { get; set; }
    public string? RelatedPaymentId { get; set; }
    public string? RelatedInvoiceId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
