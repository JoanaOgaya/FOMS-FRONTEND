using System;

namespace FOMS.Domain.Entities;

public class BankBalance
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string BankName { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public decimal CurrentBalance { get; set; }
    public string LastReconciled { get; set; } = string.Empty;
}
