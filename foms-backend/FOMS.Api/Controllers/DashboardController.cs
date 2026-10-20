using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/dashboard")]
[Route("dashboard")]
[ApiController]
public class DashboardController : ControllerBase
{
    private readonly IDashboardService _dashboardService;

    public DashboardController(IDashboardService dashboardService)
    {
        _dashboardService = dashboardService;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary() => Ok(await _dashboardService.GetSummaryAsync());

    [HttpGet("collections")]
    public async Task<IActionResult> Collections() => Ok(await _dashboardService.GetCollectionsAsync());

    [HttpGet("receivables")]
    public async Task<IActionResult> Receivables() => Ok(await _dashboardService.GetReceivablesAsync());

    [HttpGet("cash-flow")]
    public async Task<IActionResult> CashFlow() => Ok(await _dashboardService.GetCashFlowAsync());

    [HttpGet("accounting")]
    public async Task<IActionResult> Accounting() => Ok(await _dashboardService.GetAccountingAsync());

    [HttpGet("payroll")]
    public async Task<IActionResult> Payroll() => Ok(await _dashboardService.GetPayrollAsync());
}
