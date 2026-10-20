using System;

namespace FOMS.Domain.Entities;

public class SpeedPayTransaction
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string InvoiceNo { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string CardBrand { get; set; } = string.Empty;
    public string CardLast4 { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // "Approved", "Failed"
    public string TransactionDate { get; set; } = string.Empty;
}
