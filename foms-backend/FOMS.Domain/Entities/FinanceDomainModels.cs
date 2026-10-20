using System;
using System.Collections.Generic;

namespace FOMS.Domain.Entities;

public class Role
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public ICollection<Employee> Employees { get; set; } = new List<Employee>();
}

public class RefreshToken
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Token { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public bool IsRevoked { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class UserActivityLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class AuditLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public DateTime LoggedAt { get; set; } = DateTime.UtcNow;
    public string UserId { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    /// <summary>The financial value BEFORE this action was taken (e.g., "Balance: 10000.00").</summary>
    public string? BeforeValue { get; set; }
    /// <summary>The financial value AFTER this action was taken (e.g., "Balance: 6000.00").</summary>
    public string? AfterValue { get; set; }
}

public class ShipmentRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientId { get; set; } = string.Empty;
    public Client? Client { get; set; }
    public DateTime ShipmentDate { get; set; } = DateTime.UtcNow;
    public string Origin { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public decimal WeightKg { get; set; }
    public decimal Cost { get; set; }
    public string Status { get; set; } = "Pending";
}

public class ShipmentPricing
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Origin { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public decimal BaseRate { get; set; }
    public decimal RatePerKg { get; set; }
    public decimal MinimumCharge { get; set; }
}

public class StatementOfAccount
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientId { get; set; } = string.Empty;
    public Client? Client { get; set; }
    public DateTime PeriodStart { get; set; } = DateTime.UtcNow.AddMonths(-1);
    public DateTime PeriodEnd { get; set; } = DateTime.UtcNow;
    public decimal BalanceDue { get; set; }
    public decimal TotalCharges { get; set; }
}

public class PaymentCollection
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string InvoiceId { get; set; } = string.Empty;
    public Invoice? Invoice { get; set; }
    public DateTime CollectedDate { get; set; } = DateTime.UtcNow;
    public decimal AmountCollected { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public string Status { get; set; } = "Completed";
}

public class OfficialReceipt
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PaymentCollectionId { get; set; } = string.Empty;
    public PaymentCollection? PaymentCollection { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public DateTime IssuedDate { get; set; } = DateTime.UtcNow;
}

public class ReceivableBalance
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientId { get; set; } = string.Empty;
    public Client? Client { get; set; }
    public string InvoiceId { get; set; } = string.Empty;
    public Invoice? Invoice { get; set; }
    public decimal BalanceAmount { get; set; }
    public DateTime DueDate { get; set; } = DateTime.UtcNow;
    public decimal PaidAmount { get; set; } = 0m;
    public string Status { get; set; } = "Active";
    public DateTime? LastPaymentDate { get; set; }
}

public class AgingAccount
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientId { get; set; } = string.Empty;
    public Client? Client { get; set; }
    public decimal CurrentAmount { get; set; }
    public int DaysPastDue { get; set; }
    public string Status { get; set; } = "Current";
}

public class CashFlowTransaction
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public DateTime TransactionDate { get; set; } = DateTime.UtcNow;
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Type { get; set; } = "Inflow";
    public string Category { get; set; } = string.Empty;
    public string ReferenceNo { get; set; } = string.Empty;

    private string? _date;
    public string Date
    {
        get => _date ?? TransactionDate.ToString("yyyy-MM-dd");
        set
        {
            _date = value;
            if (DateTime.TryParse(value, out var parsed))
            {
                TransactionDate = parsed;
            }
        }
    }
}

public class ChartOfAccount
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string AccountCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string NormalBalance { get; set; } = string.Empty;
}

public class JournalEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string EntryNumber { get; set; } = string.Empty;
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public string Description { get; set; } = string.Empty;
    public bool Posted { get; set; }
    public ICollection<GeneralLedgerEntry> Entries { get; set; } = new List<GeneralLedgerEntry>();
}

public class GeneralLedgerEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string JournalEntryId { get; set; } = string.Empty;
    public JournalEntry? JournalEntry { get; set; }
    public string AccountId { get; set; } = string.Empty;
    public ChartOfAccount? Account { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
}

public class TrialBalance
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Period { get; set; } = string.Empty;
    public decimal TotalDebits { get; set; }
    public decimal TotalCredits { get; set; }
}

public class PayrollRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string EmployeeId { get; set; } = string.Empty;
    public Employee? Employee { get; set; }
    public DateTime PayPeriodStart { get; set; } = DateTime.UtcNow.AddDays(-15);
    public DateTime PayPeriodEnd { get; set; } = DateTime.UtcNow;
    public decimal GrossPay { get; set; }
    public decimal NetPay { get; set; }
    public decimal Deductions { get; set; }
    public ICollection<PayrollDeductionLine> DeductionLines { get; set; } = new List<PayrollDeductionLine>();
}

public class Payslip
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PayrollRecordId { get; set; } = string.Empty;
    public PayrollRecord? PayrollRecord { get; set; }
    public DateTime IssuedDate { get; set; } = DateTime.UtcNow;
    public string PayDate { get; set; } = string.Empty;
}

public class BankAdviceRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PayrollRecordId { get; set; } = string.Empty;
    public PayrollRecord? PayrollRecord { get; set; }
    public string BankAccountNumber { get; set; } = string.Empty;
    public string BankName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateTime AdviceDate { get; set; } = DateTime.UtcNow;
}

public class PaymentConcernTicket
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientId { get; set; } = string.Empty;
    public Client? Client { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime SubmittedDate { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "Open";
    public string AssignedTo { get; set; } = string.Empty;
}

public class DeliveryPaymentValidation
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ShipmentRecordId { get; set; } = string.Empty;
    public ShipmentRecord? ShipmentRecord { get; set; }
    public DateTime ValidationDate { get; set; } = DateTime.UtcNow;
    public string ValidatedBy { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public bool IsValid { get; set; }
}

