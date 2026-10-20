using System.Collections.Generic;
using System.Threading.Tasks;
using FOMS.Application.DTOs;

namespace FOMS.Application.Interfaces;

public interface IReportService
{
    Task<IEnumerable<AccountsReceivableReportDto>> GetAccountsReceivableAsync(ReportFilterDto filter);
    Task<CollectionSummaryReportDto> GetCollectionSummaryAsync(ReportFilterDto filter);
    Task<IEnumerable<AgingReportDto>> GetAgingAsync(ReportFilterDto filter);
    Task<FinancialStatementsReportDto> GetFinancialStatementsAsync(ReportFilterDto filter);
    Task<IEnumerable<GeneralLedgerReportDto>> GetGeneralLedgerAsync(ReportFilterDto filter);
    Task<IEnumerable<TrialBalanceReportDto>> GetTrialBalanceAsync(ReportFilterDto filter);
    Task<IEnumerable<PayrollReportDto>> GetPayrollReportAsync(ReportFilterDto filter);
    Task<ExportResultDto> ExportPdfAsync(string reportType);
    Task<ExportResultDto> ExportExcelAsync(string reportType);
    Task<ReconciliationReportDto> GetReconciliationAsync(ReportFilterDto filter);
}
