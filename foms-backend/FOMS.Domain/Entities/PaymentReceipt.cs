using System;

namespace FOMS.Domain.Entities;

public class PaymentReceipt
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PaymentTransactionId { get; set; } = string.Empty;
    public PaymentTransaction? PaymentTransaction { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
}
