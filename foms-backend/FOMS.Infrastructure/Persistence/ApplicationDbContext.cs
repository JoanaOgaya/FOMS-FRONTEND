using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext, IApplicationDbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<Client> Clients => Set<Client>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<ShipmentRate> ShipmentRates => Set<ShipmentRate>();
    public DbSet<SpeedPayTransaction> SpeedPayTransactions => Set<SpeedPayTransaction>();
    public DbSet<SpeedPayManualSubmission> SpeedPayManualSubmissions => Set<SpeedPayManualSubmission>();
    public DbSet<PaymentAdjustment> PaymentAdjustments => Set<PaymentAdjustment>();
        public DbSet<BankBalance> BankBalances => Set<BankBalance>();
    public DbSet<TransportationExpense> TransportationExpenses => Set<TransportationExpense>();
    public DbSet<SupportTicket> SupportTickets => Set<SupportTicket>();
    public DbSet<PaymentValidation> PaymentValidations => Set<PaymentValidation>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<UserActivityLog> UserActivityLogs => Set<UserActivityLog>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
        public DbSet<ShipmentRecord> ShipmentRecords => Set<ShipmentRecord>();
    public DbSet<ShipmentPricing> ShipmentPricings => Set<ShipmentPricing>();
        public DbSet<StatementOfAccount> StatementOfAccounts => Set<StatementOfAccount>();
    public DbSet<PaymentCollection> PaymentCollections => Set<PaymentCollection>();
    public DbSet<OfficialReceipt> OfficialReceipts => Set<OfficialReceipt>();
    public DbSet<ReceivableBalance> ReceivableBalances => Set<ReceivableBalance>();
    public DbSet<AgingAccount> AgingAccounts => Set<AgingAccount>();
    public DbSet<CashFlowTransaction> CashFlowTransactions => Set<CashFlowTransaction>();
    public DbSet<ChartOfAccount> ChartOfAccounts => Set<ChartOfAccount>();
    public DbSet<GeneralLedgerEntry> GeneralLedgerEntries => Set<GeneralLedgerEntry>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<TrialBalance> TrialBalances => Set<TrialBalance>();
    public DbSet<PayrollRecord> PayrollRecords => Set<PayrollRecord>();
    public DbSet<Payslip> Payslips => Set<Payslip>();
    public DbSet<BankAdviceRecord> BankAdviceRecords => Set<BankAdviceRecord>();
    public DbSet<PaymentConcernTicket> PaymentConcernTickets => Set<PaymentConcernTicket>();
    public DbSet<DeliveryPaymentValidation> DeliveryPaymentValidations => Set<DeliveryPaymentValidation>();
    public DbSet<PaymentTransaction> PaymentTransactions => Set<PaymentTransaction>();
    public DbSet<PaymentReceipt> PaymentReceipts => Set<PaymentReceipt>();
    public DbSet<ProcessedWebhookEvent> ProcessedWebhookEvents => Set<ProcessedWebhookEvent>();
    public DbSet<OfficialReceiptSequence> OfficialReceiptSequences => Set<OfficialReceiptSequence>();
    public DbSet<PayrollDeductionLine> PayrollDeductionLines => Set<PayrollDeductionLine>();
    public DbSet<PaymentHistory> PaymentHistories => Set<PaymentHistory>();
    public DbSet<StarsInvoiceEndorsementLink> StarsInvoiceEndorsementLinks => Set<StarsInvoiceEndorsementLink>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Client>().Ignore(c => c.IsRealData);

        modelBuilder.Entity<AuditLog>().ToTable("AppAuditLogs");

        modelBuilder.Entity<PaymentTransaction>(entity =>
        {
            entity.HasOne(t => t.Client)
                .WithMany()
                .HasForeignKey(t => t.ClientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(t => t.ShipmentRecord)
                .WithMany()
                .HasForeignKey(t => t.ShipmentRecordId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PaymentReceipt>(entity =>
        {
            entity.HasOne(r => r.PaymentTransaction)
                .WithOne()
                .HasForeignKey<PaymentReceipt>(r => r.PaymentTransactionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Employee>()
            .HasOne(e => e.RoleNavigation)
            .WithMany(r => r.Employees)
            .HasForeignKey(e => e.RoleId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<RefreshToken>()
            .HasOne<Employee>()
            .WithMany(e => e.RefreshTokens)
            .HasForeignKey(rt => rt.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<GeneralLedgerEntry>()
            .HasOne(e => e.JournalEntry)
            .WithMany(j => j.Entries)
            .HasForeignKey(e => e.JournalEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<GeneralLedgerEntry>()
            .HasOne(e => e.Account)
            .WithMany()
            .HasForeignKey(e => e.AccountId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Invoice>()
            .HasOne(b => b.Client)
            .WithMany(c => c.Invoices)
            .HasForeignKey(b => b.ClientId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ReceivableBalance>()
            .HasOne(r => r.Invoice)
            .WithMany()
            .HasForeignKey(r => r.InvoiceId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ReceivableBalance>()
            .HasOne(r => r.Client)
            .WithMany(c => c.Receivables)
            .HasForeignKey(r => r.ClientId)
            .OnDelete(DeleteBehavior.Restrict);

        foreach (var property in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var prop in property.GetProperties())
            {
                if (prop.ClrType == typeof(decimal) || prop.ClrType == typeof(decimal?))
                {
                    prop.SetPrecision(18);
                    prop.SetScale(2);
                }
            }
        }

        // Phase 1: Unique index on webhook EventId to prevent replay attacks
        modelBuilder.Entity<ProcessedWebhookEvent>()
            .HasIndex(e => e.EventId)
            .IsUnique();

        // Phase 3: Unique constraints for strict data integrity
        modelBuilder.Entity<Payment>()
            .HasIndex(p => p.OrNumber)
            .IsUnique();

        modelBuilder.Entity<Invoice>()
            .HasIndex(i => i.InvoiceNo)
            .IsUnique();

        // Phase 3: Cascade for deductions
        modelBuilder.Entity<PayrollDeductionLine>()
            .HasOne(d => d.PayrollRecord)
            .WithMany(p => p.DeductionLines)
            .HasForeignKey(d => d.PayrollRecordId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return await base.SaveChangesAsync(cancellationToken);
    }
}
