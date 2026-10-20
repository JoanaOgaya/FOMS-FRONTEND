using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;
using FOMS.Application.DTOs;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/reports")]
[Route("api/v1/reports")]
[Route("reports")]
[ApiController]
public class ReportsController : ControllerBase
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        var reports = new[]
        {
            new { id = "REP-001", name = "Accounts Receivable Aging Report", type = "accounts-receivable", generatedBy = "System", generatedAt = System.DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss") },
            new { id = "REP-002", name = "Daily Collection Summary", type = "collection-summary", generatedBy = "System", generatedAt = System.DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss") },
            new { id = "REP-003", name = "Financial Statements Summary", type = "financial-statements", generatedBy = "System", generatedAt = System.DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss") },
            new { id = "REP-004", name = "General Ledger Summary", type = "general-ledger", generatedBy = "System", generatedAt = System.DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss") },
            new { id = "REP-005", name = "Payroll Report", type = "payroll", generatedBy = "System", generatedAt = System.DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss") }
        };
        return Ok(reports);
    }

    [HttpGet("accounts-receivable")]
    public async Task<IActionResult> AccountsReceivable([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetAccountsReceivableAsync(filter));

    [HttpGet("collection-summary")]
    public async Task<IActionResult> CollectionSummary([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetCollectionSummaryAsync(filter));

    [HttpGet("aging")]
    public async Task<IActionResult> Aging([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetAgingAsync(filter));

    [HttpGet("financial-statements")]
    public async Task<IActionResult> FinancialStatements([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetFinancialStatementsAsync(filter));

    [HttpGet("general-ledger")]
    public async Task<IActionResult> GeneralLedger([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetGeneralLedgerAsync(filter));

    [HttpGet("trial-balance")]
    public async Task<IActionResult> TrialBalance([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetTrialBalanceAsync(filter));

    [HttpGet("payroll")]
    public async Task<IActionResult> Payroll([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetPayrollReportAsync(filter));

    [HttpGet("reconciliation")]
    public async Task<IActionResult> Reconciliation([FromQuery] ReportFilterDto filter) => Ok(await _reportService.GetReconciliationAsync(filter));

    [HttpGet("export/pdf")]
    public async Task<IActionResult> ExportPdf([FromQuery] string reportType)
    {
        var export = await _reportService.ExportPdfAsync(reportType ?? "report");
        return Ok(export);
    }

    [HttpGet("export/excel")]
    public async Task<IActionResult> ExportExcel([FromQuery] string reportType)
    {
        var export = await _reportService.ExportExcelAsync(reportType ?? "report");
        return Ok(export);
    }
}
