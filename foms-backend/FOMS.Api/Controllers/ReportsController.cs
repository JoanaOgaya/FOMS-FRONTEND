using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Application.DTOs;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/reports")]
[Route("api/v1/reports")]
[Route("reports")]
[ApiController]
public class ReportsController : ControllerBase
{
    private readonly IReportService _reportService;
    private readonly FomsDbContext _fomsDb;

    public ReportsController(IReportService reportService, FomsDbContext fomsDb)
    {
        _reportService = reportService;
        _fomsDb = fomsDb;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? type = null,
        [FromQuery] string? search = null,
        [FromQuery] string? category = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        try
        {
            var query = _fomsDb.Reports.AsNoTracking().Where(r => r.IsDeleted != true);

            if (!string.IsNullOrWhiteSpace(type) && !type.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                var t = type.Trim().ToLower();
                query = query.Where(r => r.ReportType.ToLower().Contains(t));
            }

            if (!string.IsNullOrWhiteSpace(category) && !category.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(r => r.Category != null && r.Category.ToLower() == category.Trim().ToLower());
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                query = query.Where(r =>
                    r.ReportCode.ToLower().Contains(s) ||
                    r.ReportName.ToLower().Contains(s) ||
                    (r.GeneratedBy != null && r.GeneratedBy.ToLower().Contains(s)) ||
                    (r.SummaryNotes != null && r.SummaryNotes.ToLower().Contains(s)));
            }

            var total = await query.CountAsync();
            var reports = await query
                .OrderByDescending(r => r.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var mapped = reports.Select(r => new
            {
                id = r.ReportCode,
                reportId = r.ReportId,
                reportCode = r.ReportCode,
                name = r.ReportName,
                reportName = r.ReportName,
                type = r.ReportType,
                reportType = r.ReportType,
                category = r.Category ?? "Financial",
                dateFrom = r.DateFrom?.ToString("yyyy-MM-dd"),
                dateTo = r.DateTo?.ToString("yyyy-MM-dd"),
                generatedBy = r.GeneratedBy,
                generatedByRole = r.GeneratedByRole,
                generatedAt = (r.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
                recordCount = r.RecordCount,
                totalAmount = r.TotalAmount ?? 0,
                fileFormat = r.FileFormat ?? "PDF",
                downloadUrl = r.DownloadUrl ?? $"/api/reports/{r.ReportType}/export",
                summaryNotes = r.SummaryNotes,
                status = r.Status
            }).ToList();

            return Ok(new
            {
                success = true,
                items = mapped,
                total,
                page,
                pageSize,
                data = mapped
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReportRequest request)
    {
        try
        {
            var nextNum = await _fomsDb.Reports.CountAsync() + 1;
            var reportCode = $"REP-{DateTime.UtcNow.Year}-{nextNum:D4}";

            var report = new Report
            {
                ReportCode = reportCode,
                ReportName = string.IsNullOrWhiteSpace(request.ReportName) ? "Financial Summary Report" : request.ReportName.Trim(),
                ReportType = string.IsNullOrWhiteSpace(request.ReportType) ? "financial-summary" : request.ReportType.Trim().ToLower(),
                Category = request.Category ?? "Financial",
                DateFrom = request.DateFrom ?? DateTime.UtcNow.AddDays(-30),
                DateTo = request.DateTo ?? DateTime.UtcNow,
                GeneratedBy = string.IsNullOrWhiteSpace(request.GeneratedBy) ? (User.Identity?.Name ?? "Financial Manager") : request.GeneratedBy.Trim(),
                GeneratedByRole = request.GeneratedByRole ?? "Financial Manager",
                RecordCount = request.RecordCount,
                TotalAmount = request.TotalAmount ?? 0,
                FileFormat = request.FileFormat ?? "PDF",
                SummaryNotes = request.SummaryNotes,
                Status = "Generated",
                CreatedAt = DateTime.UtcNow,
                IsDeleted = false
            };

            _fomsDb.Reports.Add(report);
            await _fomsDb.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = "Report successfully compiled and saved to database.",
                data = new
                {
                    id = report.ReportCode,
                    reportId = report.ReportId,
                    reportCode = report.ReportCode,
                    name = report.ReportName,
                    type = report.ReportType,
                    generatedBy = report.GeneratedBy,
                    generatedAt = report.CreatedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
                }
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
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

public class CreateReportRequest
{
    public string ReportName { get; set; } = string.Empty;
    public string ReportType { get; set; } = string.Empty;
    public string? Category { get; set; }
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public string? GeneratedBy { get; set; }
    public string? GeneratedByRole { get; set; }
    public int RecordCount { get; set; }
    public decimal? TotalAmount { get; set; }
    public string? FileFormat { get; set; } = "PDF";
    public string? SummaryNotes { get; set; }
}
