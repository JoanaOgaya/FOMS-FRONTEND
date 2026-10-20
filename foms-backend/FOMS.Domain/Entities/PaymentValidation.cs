using System;

namespace FOMS.Domain.Entities;

public class PaymentValidation
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string InvoiceNo { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public string DriverName { get; set; } = string.Empty;
    public decimal AmountCollected { get; set; }
    public string Status { get; set; } = "Pending"; // "Pending", "Approved", "Rejected"
    public string DateSubmitted { get; set; } = string.Empty;
}
