using System.Collections.Generic;

namespace FOMS.Application.DTOs;

public class DashboardSummaryDto
{
    public decimal TotalCollections { get; set; }
    public decimal TotalReceivables { get; set; }
    public decimal CashFlowBalance { get; set; }
    public int OpenTickets { get; set; }
}

public class DashboardCollectionDto
{
    public decimal MonthlyCollections { get; set; }
    public int TransactionsCount { get; set; }
}

public class DashboardReceivablesDto
{
    public decimal TotalReceivables { get; set; }
    public int OverdueAccounts { get; set; }
}

public class DashboardCashFlowDto
{
    public decimal Inflow { get; set; }
    public decimal Outflow { get; set; }
}

public class DashboardAccountingDto
{
    public int AccountsCount { get; set; }
    public decimal TotalDebits { get; set; }
    public decimal TotalCredits { get; set; }
}

public class DashboardPayrollDto
{
    public int ActivePayrollRecords { get; set; }
    public decimal TotalPayrollCost { get; set; }
}
