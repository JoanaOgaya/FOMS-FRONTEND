using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;

namespace FOMS.Application.Services;

public class ReportService : IReportService
{
    private readonly IApplicationDbContext _context;

    public ReportService(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<AccountsReceivableReportDto>> GetAccountsReceivableAsync(ReportFilterDto filter)
    {
        var query = _context.ReceivableBalances.Include(r => r.Client).AsQueryable();

        if (filter != null)
        {
            if (!string.IsNullOrEmpty(filter.ClientId)) query = query.Where(r => r.ClientId == filter.ClientId);
        }

        var results = await query.AsNoTracking().ToListAsync();
        
        // Post processing to apply date ranges or status since DueDate is used
        if (filter != null)
        {
            if (!string.IsNullOrEmpty(filter.StartDate) && DateTime.TryParse(filter.StartDate, out var start))
                results = results.Where(r => r.DueDate >= start).ToList();
            if (!string.IsNullOrEmpty(filter.EndDate) && DateTime.TryParse(filter.EndDate, out var end))
                results = results.Where(r => r.DueDate <= end).ToList();
        }

        return results.Select(r => new AccountsReceivableReportDto
        {
            ClientName = r.Client != null ? r.Client.Name : string.Empty,
            Balance = r.BalanceAmount,
            DaysPastDue = Math.Max(0, (int)(DateTime.UtcNow - r.DueDate).TotalDays)
        });
    }

    public async Task<CollectionSummaryReportDto> GetCollectionSummaryAsync(ReportFilterDto filter)
    {
        var query = _context.PaymentCollections.AsQueryable();

        if (filter != null)
        {
            if (!string.IsNullOrEmpty(filter.StartDate) && DateTime.TryParse(filter.StartDate, out var start))
                query = query.Where(c => c.CollectedDate >= start);
            if (!string.IsNullOrEmpty(filter.EndDate) && DateTime.TryParse(filter.EndDate, out var end))
                query = query.Where(c => c.CollectedDate <= end);
        }

        var total = await query.SumAsync(c => c.AmountCollected);
        var count = await query.CountAsync();
        return new CollectionSummaryReportDto
        {
            TotalCollected = total,
            Transactions = count
        };
    }

    public async Task<IEnumerable<AgingReportDto>> GetAgingAsync(ReportFilterDto filter)
    {
        var query = _context.AgingAccounts.Include(a => a.Client).AsQueryable();

        if (filter != null)
        {
            if (!string.IsNullOrEmpty(filter.ClientId)) query = query.Where(a => a.ClientId == filter.ClientId);
            if (!string.IsNullOrEmpty(filter.Status)) query = query.Where(a => a.Status == filter.Status);
        }

        var results = await query.AsNoTracking().ToListAsync();

        if (filter != null && !string.IsNullOrEmpty(filter.AgingBucket))
        {
            if (filter.AgingBucket == "Current") results = results.Where(a => a.DaysPastDue == 0).ToList();
            else if (filter.AgingBucket == "1-30") results = results.Where(a => a.DaysPastDue >= 1 && a.DaysPastDue <= 30).ToList();
            else if (filter.AgingBucket == "31-60") results = results.Where(a => a.DaysPastDue >= 31 && a.DaysPastDue <= 60).ToList();
            else if (filter.AgingBucket == "61-90") results = results.Where(a => a.DaysPastDue >= 61 && a.DaysPastDue <= 90).ToList();
            else if (filter.AgingBucket == "90+") results = results.Where(a => a.DaysPastDue > 90).ToList();
        }

        return results.Select(a => new AgingReportDto
        {
            ClientName = a.Client != null ? a.Client.Name : string.Empty,
            Amount = a.CurrentAmount,
            DaysOutstanding = a.DaysPastDue
        });
    }

    public async Task<FinancialStatementsReportDto> GetFinancialStatementsAsync(ReportFilterDto filter)
    {
        // Simple aggregate for now
        var assets = await _context.BankBalances.SumAsync(b => b.CurrentBalance) + await _context.CashFlowTransactions.Where(e => e.Type == "Inflow").SumAsync(e => e.Amount);
        var liabilities = await _context.Payments.SumAsync(p => p.Amount);
        var equity = assets - liabilities;
        return new FinancialStatementsReportDto
        {
            TotalAssets = assets,
            TotalLiabilities = liabilities,
            TotalEquity = equity
        };
    }

    public async Task<IEnumerable<GeneralLedgerReportDto>> GetGeneralLedgerAsync(ReportFilterDto filter)
    {
        var query = _context.GeneralLedgerEntries.Include(g => g.Account).AsQueryable();

        // Note: For date filtering we'd need JournalEntry joined
        return await query
            .AsNoTracking()
            .Select(g => new GeneralLedgerReportDto
            {
                AccountName = g.Account != null ? g.Account.Name : g.AccountId,
                Debit = g.Debit,
                Credit = g.Credit
            })
            .ToListAsync();
    }

    public async Task<IEnumerable<TrialBalanceReportDto>> GetTrialBalanceAsync(ReportFilterDto filter)
    {
        var query = _context.TrialBalances.AsQueryable();

        return await query
            .AsNoTracking()
            .Select(t => new TrialBalanceReportDto
            {
                TotalDebits = t.TotalDebits,
                TotalCredits = t.TotalCredits
            })
            .ToListAsync();
    }

    public async Task<IEnumerable<PayrollReportDto>> GetPayrollReportAsync(ReportFilterDto filter)
    {
        var query = _context.PayrollRecords.Include(p => p.Employee).AsQueryable();

        if (filter != null)
        {
            if (!string.IsNullOrEmpty(filter.EmployeeId)) query = query.Where(p => p.EmployeeId == filter.EmployeeId);
            if (!string.IsNullOrEmpty(filter.StartDate) && DateTime.TryParse(filter.StartDate, out var start))
                query = query.Where(p => p.PayPeriodStart >= start);
            if (!string.IsNullOrEmpty(filter.EndDate) && DateTime.TryParse(filter.EndDate, out var end))
                query = query.Where(p => p.PayPeriodEnd <= end);
        }

        return await query
            .AsNoTracking()
            .Select(p => new PayrollReportDto
            {
                EmployeeName = p.Employee != null ? p.Employee.Name : p.EmployeeId,
                NetPay = p.NetPay
            })
            .ToListAsync();
    }

    public async Task<ExportResultDto> ExportPdfAsync(string reportType)
    {
        // Simple text-based representation of actual data for PDF download format
        var content = new StringBuilder();
        content.AppendLine("==================================================================================================");
        content.AppendLine($"FINANCE OPERATIONS MANAGEMENT SYSTEM (FOMS) - PDF EXPORT REPORT");
        content.AppendLine($"Report Type: {reportType.ToUpper()}");
        content.AppendLine($"Generated At: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");
        content.AppendLine("==================================================================================================");
        content.AppendLine();

        if (reportType.Contains("ar") || reportType.Contains("receivable"))
        {
            var invoices = await _context.Invoices.AsNoTracking().ToListAsync();
            content.AppendLine("Invoice No\tClient\tBilling Date\tDue Date\tTotal Amount\tBalance\tStatus");
            content.AppendLine("--------------------------------------------------------------------------------------------------");
            foreach (var inv in invoices)
            {
                content.AppendLine($"{inv.InvoiceNo}\t{inv.ClientName}\t{inv.BillingDate}\t{inv.DueDate}\t{inv.TotalAmount:N2}\t{inv.Balance:N2}\t{inv.PaymentStatus}");
            }
        }
        else if (reportType.Contains("collection") || reportType.Contains("payment"))
        {
            var payments = await _context.Payments.AsNoTracking().ToListAsync();
            content.AppendLine("OR Number\tInvoice No\tClient\tPayment Date\tAmount\tMethod\tReference");
            content.AppendLine("--------------------------------------------------------------------------------------------------");
            foreach (var p in payments)
            {
                content.AppendLine($"{p.OrNumber}\t{p.InvoiceNo}\t{p.ClientName}\t{p.PaymentDate}\t{p.Amount:N2}\t{p.PaymentMethod}\t{p.ReferenceNumber ?? "N/A"}");
            }
        }
        else
        {
            var flow = await _context.CashFlowTransactions.AsNoTracking().ToListAsync();
            content.AppendLine("Ref No\tDate\tType\tCategory\tAmount\tDescription");
            content.AppendLine("--------------------------------------------------------------------------------------------------");
            foreach (var entry in flow)
            {
                content.AppendLine($"{entry.ReferenceNo}\t{entry.Date}\t{entry.Type}\t{entry.Category}\t{entry.Amount:N2}\t{entry.Description}");
            }
        }

        return new ExportResultDto
        {
            FileName = $"{reportType.Replace(" ", "_")}.pdf",
            FileContentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(content.ToString()))
        };
    }

    public async Task<ExportResultDto> ExportExcelAsync(string reportType)
    {
        // Simple comma-separated CSV format as replacement for XLSX for standard text export
        var content = new StringBuilder();
        
        if (reportType.Contains("ar") || reportType.Contains("receivable"))
        {
            var invoices = await _context.Invoices.AsNoTracking().ToListAsync();
            content.AppendLine("Invoice No,Client,Billing Date,Due Date,Total Amount,Amount Paid,Balance,Status,Aging Bucket");
            foreach (var inv in invoices)
            {
                content.AppendLine($"\"{inv.InvoiceNo}\",\"{inv.ClientName}\",\"{inv.BillingDate}\",\"{inv.DueDate}\",{inv.TotalAmount},{inv.AmountPaid},{inv.Balance},\"{inv.PaymentStatus}\",\"{inv.AgingBucket}\"");
            }
        }
        else if (reportType.Contains("collection") || reportType.Contains("payment"))
        {
            var payments = await _context.Payments.AsNoTracking().ToListAsync();
            content.AppendLine("OR Number,Invoice No,Client,Payment Date,Amount,Method,Reference Number,Recorded By");
            foreach (var p in payments)
            {
                content.AppendLine($"\"{p.OrNumber}\",\"{p.InvoiceNo}\",\"{p.ClientName}\",\"{p.PaymentDate}\",{p.Amount},\"{p.PaymentMethod}\",\"{p.ReferenceNumber ?? ""}\",\"{p.RecordedBy}\"");
            }
        }
        else
        {
            var flow = await _context.CashFlowTransactions.AsNoTracking().ToListAsync();
            content.AppendLine("Ref No,Date,Type,Category,Amount,Description");
            foreach (var entry in flow)
            {
                content.AppendLine($"\"{entry.ReferenceNo}\",\"{entry.Date}\",\"{entry.Type}\",\"{entry.Category}\",{entry.Amount},\"{entry.Description}\"");
            }
        }

        return new ExportResultDto
        {
            FileName = $"{reportType.Replace(" ", "_")}.csv",
            FileContentBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(content.ToString()))
        };
    }

    public async Task<ReconciliationReportDto> GetReconciliationAsync(ReportFilterDto filter)
    {
        var paymentsQuery = _context.Payments.AsQueryable();
        var cashFlowQuery = _context.CashFlowTransactions.Where(c => c.Type == "Inflow").AsQueryable();

        if (filter != null)
        {
            if (!string.IsNullOrEmpty(filter.StartDate) && DateTime.TryParse(filter.StartDate, out var start))
            {
                paymentsQuery = paymentsQuery.Where(p => string.Compare(p.PaymentDate, filter.StartDate) >= 0);
                cashFlowQuery = cashFlowQuery.Where(c => string.Compare(c.Date, filter.StartDate) >= 0);
            }
            if (!string.IsNullOrEmpty(filter.EndDate) && DateTime.TryParse(filter.EndDate, out var end))
            {
                paymentsQuery = paymentsQuery.Where(p => string.Compare(p.PaymentDate, filter.EndDate) <= 0);
                cashFlowQuery = cashFlowQuery.Where(c => string.Compare(c.Date, filter.EndDate) <= 0);
            }
        }

        var totalPayments = await paymentsQuery.SumAsync(p => p.Amount);
        var totalInflow = await cashFlowQuery.SumAsync(c => c.Amount);

        var discrepancy = totalPayments - totalInflow;

        return new ReconciliationReportDto
        {
            TotalPaymentsRecorded = totalPayments,
            TotalCashInflow = totalInflow,
            DiscrepancyAmount = discrepancy,
            IsReconciled = discrepancy == 0,
            Details = discrepancy == 0 ? "All payments successfully match cash inflow." : $"Discrepancy of {Math.Abs(discrepancy):N2} found between Payments and Cash Inflow records."
        };
    }
}
