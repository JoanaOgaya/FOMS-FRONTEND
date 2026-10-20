using System;
using System.Collections.Generic;

namespace FOMS.Application.DTOs;

public class AdvancedFilterRequest
{
    public string? SearchQuery { get; set; }
    public string? DateFilterType { get; set; } // Today, Yesterday, Last7Days, Last30Days, ThisMonth, LastMonth, Quarterly, Yearly, Custom
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    
    // Statuses
    public List<string>? PaymentStatuses { get; set; } // Paid, Unpaid, Overdue
    public List<string>? TransactionTypes { get; set; } // Inflow, Outflow, Cashier, SpeedPay, Adjusted, Archived
    
    // Client and Employee
    public string? ClientId { get; set; }
    public string? EmployeeId { get; set; }
    public string? CashCategory { get; set; }
    
    // Limits
    public decimal? MinAmount { get; set; }
    public decimal? MaxAmount { get; set; }
}

public class SmartSearchResult
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // Invoice, Payment, Client, CashFlow, AuditLog
    public string ReferenceNumber { get; set; } = string.Empty; // InvoiceNo, ORNumber, ReferenceNo
    public string Title { get; set; } = string.Empty;
    public string Subtitle { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Date { get; set; } = string.Empty;
    public string Status { get; set; } = "Active";
    public double MatchScore { get; set; }
    public bool Archived { get; set; }
}

public class AdvancedAnalyticsDto
{
    public PaymentPerformanceDto PaymentPerformance { get; set; } = new();
    public CashFlowIntelligenceDto CashFlowIntelligence { get; set; } = new();
    public ReceivablesAnalyticsDto Receivables { get; set; } = new();
    public ClientFinancialIntelligenceDto Clients { get; set; } = new();
    public WorkforceOperationsAnalyticsDto Operations { get; set; } = new();
    public AuditComplianceIntelligenceDto Compliance { get; set; } = new();
    public List<AnomalyAlertDto> Anomalies { get; set; } = new();
}

public class PaymentPerformanceDto
{
    public int TotalPaymentsProcessed { get; set; }
    public int SuccessfulPayments { get; set; }
    public int FailedPayments { get; set; }
    public decimal DigitalPaymentSuccessRate { get; set; } // Digital payments success percentage
    public decimal PaymentCompletionRate { get; set; } // Paid invoices / total invoices percentage
    public decimal OverduePaymentRate { get; set; } // Overdue / unpaid percentage
    public double AveragePaymentCompletionTimeDays { get; set; }
    public List<MonthlyTrendPointDto> MonthlyTrends { get; set; } = new();
    public string PerformanceInsight { get; set; } = string.Empty;
}

public class MonthlyTrendPointDto
{
    public string Month { get; set; } = string.Empty;
    public decimal Billed { get; set; }
    public decimal Collected { get; set; }
    public int Count { get; set; }
}

public class CashFlowIntelligenceDto
{
    public decimal TotalInflow { get; set; }
    public decimal TotalOutflow { get; set; }
    public decimal NetFinancialMovement { get; set; }
    public List<CashFlowCategorySummaryDto> InflowCategories { get; set; } = new();
    public List<CashFlowCategorySummaryDto> OutflowCategories { get; set; } = new();
    public string CashFlowInsight { get; set; } = string.Empty;
}

public class CashFlowCategorySummaryDto
{
    public string Category { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public decimal Percentage { get; set; }
}

public class ReceivablesAnalyticsDto
{
    public decimal TotalOutstandingBalance { get; set; }
    public decimal OverdueBalance { get; set; }
    public decimal CollectionEfficiencyRate { get; set; }
    public List<AgingBucketSummaryDto> AgingBuckets { get; set; } = new();
    public string ReceivablesInsight { get; set; } = string.Empty;
}

public class AgingBucketSummaryDto
{
    public string BucketName { get; set; } = string.Empty; // Current, 1-30, 31-60, 61-90, 90+
    public decimal Amount { get; set; }
    public int Count { get; set; }
    public decimal Percentage { get; set; }
}

public class ClientFinancialIntelligenceDto
{
    public List<TopClientDto> TopClients { get; set; } = new();
    public List<ClientBehaviorDto> BehavioralTrends { get; set; } = new();
}

public class TopClientDto
{
    public string ClientId { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public decimal TotalBilled { get; set; }
    public decimal TotalPaid { get; set; }
    public decimal Balance { get; set; }
}

public class ClientBehaviorDto
{
    public string ClientName { get; set; } = string.Empty;
    public double ConsistencyScore { get; set; } // 0 to 100 based on promptness
    public int OverdueInvoicesCount { get; set; }
    public string Status { get; set; } = "Active";
}

public class WorkforceOperationsAnalyticsDto
{
    public double AverageTransactionProcessingSpeedSeconds { get; set; }
    public int TotalAdjustmentsProcessed { get; set; }
    public List<CashierWorkloadDto> CashierWorkloads { get; set; } = new();
    public string WorkloadInsight { get; set; } = string.Empty;
}

public class CashierWorkloadDto
{
    public string CashierName { get; set; } = string.Empty;
    public int TransactionCount { get; set; }
    public decimal TotalValue { get; set; }
}

public class AuditComplianceIntelligenceDto
{
    public int TotalAuditLogsCount { get; set; }
    public int UnauthorizedAccessAttempts { get; set; }
    public int HighValueAdjustmentsCount { get; set; }
    public decimal ComplianceScore { get; set; } // calculated out of 100
    public string ComplianceInsight { get; set; } = string.Empty;
}

public class AnomalyAlertDto
{
    public string Severity { get; set; } = "Medium"; // Low, Medium, High
    public string Category { get; set; } = string.Empty; // CashFlow, Audit, Receivables, Operations
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
}

public class PredictiveAnalyticsDto
{
    public decimal PredictedNextMonthInflow { get; set; }
    public int PredictedOverdueAccountsCount { get; set; }
    public decimal PredictedReceivableRiskAmount { get; set; }
    public string CashFlowTrendDirection { get; set; } = "Stable"; // Growth, Decline, Stable
    public List<HourlyVolumePredictionDto> PeakVolumeHours { get; set; } = new();
    public List<string> ForecastInsights { get; set; } = new();
}

public class HourlyVolumePredictionDto
{
    public string HourString { get; set; } = string.Empty; // e.g. "09:00 AM"
    public double ExpectedProbability { get; set; }
}
