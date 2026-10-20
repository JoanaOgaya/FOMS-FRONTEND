using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Application.Interfaces;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/analytics")]
[Route("api/v1/analytics")]
[ApiController]
public class AnalyticsController : ControllerBase
{
    private readonly IAnalyticsService _analyticsService;
    private readonly IPredictionService _predictionService;

    public AnalyticsController(IAnalyticsService analyticsService, IPredictionService predictionService)
    {
        _analyticsService = analyticsService;
        _predictionService = predictionService;
    }

    [HttpGet]
    [HttpGet("metrics")]
    public async Task<IActionResult> GetMetrics()
    {
        var metrics = await _analyticsService.GetAdvancedAnalyticsAsync();
        return Ok(metrics);
    }

    [HttpGet("predictions")]
    public async Task<IActionResult> GetPredictions()
    {
        var predictions = await _predictionService.GetPredictionsAsync();
        return Ok(predictions);
    }
}
