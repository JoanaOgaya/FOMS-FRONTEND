using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;

namespace FOMS.Application.Services;

public class DashboardService : IDashboardService
{
    private readonly IApplicationDbContext _context;

    public DashboardService(IApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<DashboardSummaryDto> GetSummaryAsync()
    {
        var totalCollections = await _context.Payments.SumAsync(p => p.Amount);
        var totalReceivables = await _context.Invoices.Where(i => i.Balance > 0).SumAsync(i => i.Balance);
        var cashFlowBalance = await _context.CashFlowTransactions.SumAsync(e => e.Type == "Inflow" ? e.Amount : -e.Amount);
        var openTickets = await _context.SupportTickets.CountAsync(t => t.Status != "Resolved");

        return new DashboardSummaryDto
        {
            TotalCollections = totalCollections,
            TotalReceivables = totalReceivables,
            CashFlowBalance = cashFlowBalance,
            OpenTickets = openTickets
        };
    }

    public async Task<DashboardCollectionDto> GetCollectionsAsync()
    {
        var totalCollections = await _context.Payments.SumAsync(p => p.Amount);
        var transactionsCount = await _context.Payments.CountAsync();
        return new DashboardCollectionDto
        {
            MonthlyCollections = totalCollections,
            TransactionsCount = transactionsCount
        };
    }

    public async Task<DashboardReceivablesDto> GetReceivablesAsync()
    {
        var totalReceivables = await _context.Invoices.Where(i => i.Balance > 0).SumAsync(i => i.Balance);
        var overdueAccounts = await _context.Invoices.CountAsync(i => i.DaysOverdue > 0);
        return new DashboardReceivablesDto
        {
            TotalReceivables = totalReceivables,
            OverdueAccounts = overdueAccounts
        };
    }

    public async Task<DashboardCashFlowDto> GetCashFlowAsync()
    {
        var inflow = await _context.CashFlowTransactions.Where(e => e.Type == "Inflow").SumAsync(e => e.Amount);
        var outflow = await _context.CashFlowTransactions.Where(e => e.Type == "Outflow").SumAsync(e => e.Amount);
        return new DashboardCashFlowDto
        {
            Inflow = inflow,
            Outflow = outflow
        };
    }

    public async Task<DashboardAccountingDto> GetAccountingAsync()
    {
        var totalDebits = await _context.GeneralLedgerEntries.SumAsync(e => e.Debit);
        var totalCredits = await _context.GeneralLedgerEntries.SumAsync(e => e.Credit);
        var accountsCount = await _context.ChartOfAccounts.CountAsync();
        return new DashboardAccountingDto
        {
            TotalDebits = totalDebits,
            TotalCredits = totalCredits,
            AccountsCount = accountsCount
        };
    }

    public async Task<DashboardPayrollDto> GetPayrollAsync()
    {
        var activePayroll = await _context.PayrollRecords.CountAsync();
        var totalPayrollCost = await _context.PayrollRecords.SumAsync(r => r.NetPay);
        return new DashboardPayrollDto
        {
            ActivePayrollRecords = activePayroll,
            TotalPayrollCost = totalPayrollCost
        };
    }
}
