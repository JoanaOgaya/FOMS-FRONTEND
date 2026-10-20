using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using FOMS.Domain.Entities;
// Removed incorrect SqlServer aliases – the needed types exist in the general domain namespace.


namespace FOMS.Application.Interfaces;

public interface IApplicationDbContext
{
    DatabaseFacade Database { get; }
    DbSet<Client> Clients { get; }
    DbSet<Invoice> Invoices { get; }
    DbSet<Payment> Payments { get; }
    DbSet<FOMS.Domain.Entities.Employee> Employees { get; }
    DbSet<FOMS.Domain.Entities.ActivityLog> ActivityLogs { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<ShipmentRate> ShipmentRates { get; }
    DbSet<SpeedPayTransaction> SpeedPayTransactions { get; }
    DbSet<SpeedPayManualSubmission> SpeedPayManualSubmissions { get; }
    DbSet<PaymentAdjustment> PaymentAdjustments { get; }
    DbSet<BankBalance> BankBalances { get; }
    DbSet<TransportationExpense> TransportationExpenses { get; }
    DbSet<SupportTicket> SupportTickets { get; }
    DbSet<PaymentValidation> PaymentValidations { get; }
    DbSet<Role> Roles { get; }
    DbSet<FOMS.Domain.Entities.RefreshToken> RefreshTokens { get; }
    DbSet<FOMS.Domain.Entities.UserActivityLog> UserActivityLogs { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<FOMS.Domain.Entities.ShipmentRecord> ShipmentRecords { get; }
    DbSet<FOMS.Domain.Entities.ShipmentPricing> ShipmentPricings { get; }
    DbSet<FOMS.Domain.Entities.StatementOfAccount> StatementOfAccounts { get; }
    DbSet<FOMS.Domain.Entities.PaymentCollection> PaymentCollections { get; }
    DbSet<OfficialReceipt> OfficialReceipts { get; }
    DbSet<FOMS.Domain.Entities.ReceivableBalance> ReceivableBalances { get; }
    DbSet<FOMS.Domain.Entities.AgingAccount> AgingAccounts { get; }
    DbSet<FOMS.Domain.Entities.ChartOfAccount> ChartOfAccounts { get; }
    DbSet<FOMS.Domain.Entities.GeneralLedgerEntry> GeneralLedgerEntries { get; }
    DbSet<FOMS.Domain.Entities.JournalEntry> JournalEntries { get; }
    DbSet<FOMS.Domain.Entities.TrialBalance> TrialBalances { get; }
    DbSet<FOMS.Domain.Entities.PayrollRecord> PayrollRecords { get; }
    DbSet<FOMS.Domain.Entities.Payslip> Payslips { get; }
    DbSet<FOMS.Domain.Entities.BankAdviceRecord> BankAdviceRecords { get; }
    DbSet<FOMS.Domain.Entities.PaymentConcernTicket> PaymentConcernTickets { get; }
    DbSet<FOMS.Domain.Entities.DeliveryPaymentValidation> DeliveryPaymentValidations { get; }
    DbSet<FOMS.Domain.Entities.PaymentTransaction> PaymentTransactions { get; }
    DbSet<FOMS.Domain.Entities.PaymentReceipt> PaymentReceipts { get; }
    DbSet<FOMS.Domain.Entities.CashFlowTransaction> CashFlowTransactions { get; }
    DbSet<FOMS.Domain.Entities.OfficialReceiptSequence> OfficialReceiptSequences { get; }
    DbSet<FOMS.Domain.Entities.PayrollDeductionLine> PayrollDeductionLines { get; }
    DbSet<PaymentHistory> PaymentHistories { get; }

    /// <summary>
    /// Stores processed PayMongo webhook event IDs for replay attack prevention.
    /// </summary>
    DbSet<ProcessedWebhookEvent> ProcessedWebhookEvents { get; }

    /// <summary>
    /// Links invoices to STARS endorsement requests and receiving tracking.
    /// </summary>
    DbSet<StarsInvoiceEndorsementLink> StarsInvoiceEndorsementLinks { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}


