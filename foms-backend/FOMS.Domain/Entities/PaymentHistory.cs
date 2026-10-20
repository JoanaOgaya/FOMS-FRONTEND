using System;

namespace FOMS.Domain.Entities;

public class PaymentHistory
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PaymentId { get; set; } = string.Empty;
    public string InvoiceId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Remarks { get; set; } = string.Empty;
    public string PerformedBy { get; set; } = string.Empty;
    public string PerformedRole { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
