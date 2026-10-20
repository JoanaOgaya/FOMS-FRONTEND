using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace FOMS.Domain.Entities;

public class Client
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string BusinessName { get; set; } = string.Empty;
    public string ContactPerson { get; set; } = string.Empty;
    public string ContactNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? Tin { get; set; }
    public decimal CreditLimit { get; set; }
    public decimal CurrentBalance { get; set; }
    public decimal TotalBilled { get; set; }
    public decimal TotalPaid { get; set; }
    public string Status { get; set; } = "Active"; // "Active" or "Inactive"
    [NotMapped]
    public bool IsRealData { get; set; } = false; // true if the record represents real production data
    public bool IsActive { get; set; } = true;
    public string DmsClientId { get; set; } = string.Empty;
    public string DmsStatus { get; set; } = "Active";
    public bool SyncedFromDms { get; set; } = true;
    public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string DateRegistered { get; set; } = string.Empty;
    public string LastTransaction { get; set; } = string.Empty;
    public bool Archived { get; set; }
    public string PasswordHash { get; set; } = string.Empty;

    // Navigation properties for relationships
    public ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();
    public ICollection<ReceivableBalance> Receivables { get; set; } = new List<ReceivableBalance>();
}
