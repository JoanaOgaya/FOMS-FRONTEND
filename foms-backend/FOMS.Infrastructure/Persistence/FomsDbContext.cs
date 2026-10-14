using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;


namespace FOMS.Infrastructure.Persistence;

public class FomsDbContext : DbContext
{
    public FomsDbContext(DbContextOptions<FomsDbContext> options) : base(options)
    {
    }

    public DbSet<Role> Roles { get; set; } = null!;
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<Client> Clients { get; set; } = null!;
    public DbSet<ClientFinanceSetting> ClientFinanceSettings { get; set; } = null!;
    public DbSet<ClientRate> ClientRates { get; set; } = null!;
    public DbSet<Invoice> Invoices { get; set; } = null!;
    public DbSet<AccountsReceivable> AccountsReceivable { get; set; } = null!;
    public DbSet<Payment> Payments { get; set; } = null!;
    public DbSet<PaymentHistory> PaymentHistory { get; set; } = null!;
    public DbSet<Notification> Notifications { get; set; } = null!;
    public DbSet<AuditLog> AuditLogs { get; set; } = null!;
    public DbSet<Waybill> Waybills { get; set; } = null!;
    public DbSet<ProofOfDelivery> ProofOfDeliveries { get; set; } = null!;
    public DbSet<BillingDocument> BillingDocuments { get; set; } = null!;
    public DbSet<InvoiceLineItem> InvoiceLineItems { get; set; } = null!;
    public DbSet<InvoiceComputation> InvoiceComputations { get; set; } = null!;
    public DbSet<FomsOfficialReceipt> OfficialReceipts { get; set; } = null!;
    public DbSet<CashInflow> CashInflows { get; set; } = null!;
    public DbSet<CashOutflow> CashOutflows { get; set; } = null!;
    public DbSet<CashAdvance> CashAdvances { get; set; } = null!;
    public DbSet<Liquidation> Liquidations { get; set; } = null!;
    public DbSet<LiquidationLineItem> LiquidationLineItems { get; set; } = null!;
    public DbSet<LiquidationDocument> LiquidationDocuments { get; set; } = null!;
    public DbSet<FinancialAdjustment> FinancialAdjustments { get; set; } = null!;
    public DbSet<CreditMemo> CreditMemos { get; set; } = null!;
    public DbSet<RefundRequest> RefundRequests { get; set; } = null!;
    public DbSet<Settlement> Settlements { get; set; } = null!;
    public DbSet<AIReviewHistory> AIReviewHistories { get; set; } = null!;
    public DbSet<AIOutputHistory> AIOutputHistories { get; set; } = null!;
    public DbSet<AIScanLog> AIScanLogs { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Role>().ToTable("Roles", "dbo");
        modelBuilder.Entity<User>().ToTable("Users", "dbo");
        modelBuilder.Entity<Client>().ToTable("Clients", "dbo");
        modelBuilder.Entity<ClientFinanceSetting>().ToTable("ClientFinanceSettings", "dbo");
        modelBuilder.Entity<ClientRate>().ToTable("ClientRates", "dbo");
        modelBuilder.Entity<Invoice>().ToTable("Invoices", "dbo");
        modelBuilder.Entity<AccountsReceivable>().ToTable("AccountsReceivable", "dbo");
        modelBuilder.Entity<Payment>().ToTable("Payments", "dbo");
        modelBuilder.Entity<PaymentHistory>().ToTable("PaymentHistory", "dbo");
        modelBuilder.Entity<Notification>().ToTable("Notifications", "dbo");
        modelBuilder.Entity<AuditLog>().ToTable("AuditLogs", "dbo");
        modelBuilder.Entity<Waybill>().ToTable("Waybills", "dbo");
        modelBuilder.Entity<ProofOfDelivery>().ToTable("ProofOfDeliveries", "dbo");
        modelBuilder.Entity<BillingDocument>().ToTable("BillingDocuments", "dbo");
        modelBuilder.Entity<InvoiceLineItem>().ToTable("InvoiceLineItems", "dbo");
        modelBuilder.Entity<InvoiceComputation>().ToTable("InvoiceComputations", "dbo");
        modelBuilder.Entity<FomsOfficialReceipt>().ToTable("OfficialReceipts", "dbo");
        modelBuilder.Entity<CashInflow>().ToTable("CashInflows", "dbo");
        modelBuilder.Entity<CashOutflow>().ToTable("CashOutflows", "dbo");
        modelBuilder.Entity<CashAdvance>().ToTable("CashAdvances", "dbo");
        modelBuilder.Entity<Liquidation>().ToTable("Liquidations", "dbo");
        modelBuilder.Entity<LiquidationLineItem>().ToTable("LiquidationLineItems", "dbo");
        modelBuilder.Entity<LiquidationDocument>().ToTable("LiquidationDocuments", "dbo");
        modelBuilder.Entity<FinancialAdjustment>().ToTable("FinancialAdjustments", "dbo");
        modelBuilder.Entity<CreditMemo>().ToTable("CreditMemos", "dbo");
        modelBuilder.Entity<RefundRequest>().ToTable("RefundRequests", "dbo");
        modelBuilder.Entity<Settlement>().ToTable("Settlements", "dbo");
        modelBuilder.Entity<AIReviewHistory>().ToTable("AIReviewHistory", "dbo");
        modelBuilder.Entity<AIOutputHistory>().ToTable("AIOutputHistory", "dbo");
        modelBuilder.Entity<AIScanLog>().ToTable("ai_scan_logs", "dbo");
    }
}
