using System;

namespace FOMS.Domain.Entities;

public class PaymentTransaction
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientId { get; set; } = string.Empty;
    public Client? Client { get; set; }
    public string? ShipmentRecordId { get; set; }
    public ShipmentRecord? ShipmentRecord { get; set; }
    public string? InvoiceNo { get; set; }
    public decimal Amount { get; set; }
    public string PayMongoCheckoutId { get; set; } = string.Empty;
    public string? PayMongoPaymentId { get; set; }
    public string Status { get; set; } = "Pending"; // Pending, Completed, Failed, Expired
    public string? ReceiptUrl { get; set; }
    public string? ReferenceOrNumber { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
