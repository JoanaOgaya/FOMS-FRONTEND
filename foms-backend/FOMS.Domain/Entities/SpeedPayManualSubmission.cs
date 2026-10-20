using System;

namespace FOMS.Domain.Entities;

public class SpeedPayManualSubmission
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string InvoiceId { get; set; } = string.Empty;
    public string InvoiceNumber { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;   // FOMS client ID
    public string ClientName { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;
    public string ReferenceNumber { get; set; } = string.Empty;
    public decimal AmountPaid { get; set; }
    public string ProofFileName { get; set; } = string.Empty;
    public string? ProofFileUrl { get; set; }
    public string Status { get; set; } = "Pending Validation"; // Pending Validation, Validated, Rejected
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
}
