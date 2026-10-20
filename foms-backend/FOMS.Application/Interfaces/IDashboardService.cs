using System.Collections.Generic;
using System.Threading.Tasks;
using FOMS.Application.DTOs;

namespace FOMS.Application.Interfaces;

public interface IDashboardService
{
    Task<DashboardSummaryDto> GetSummaryAsync();
    Task<DashboardCollectionDto> GetCollectionsAsync();
    Task<DashboardReceivablesDto> GetReceivablesAsync();
    Task<DashboardCashFlowDto> GetCashFlowAsync();
    Task<DashboardAccountingDto> GetAccountingAsync();
    Task<DashboardPayrollDto> GetPayrollAsync();
}
