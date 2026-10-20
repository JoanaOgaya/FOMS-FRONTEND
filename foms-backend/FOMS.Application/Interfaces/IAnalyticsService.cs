using System.Threading.Tasks;
using FOMS.Application.DTOs;

namespace FOMS.Application.Interfaces;

public interface IAnalyticsService
{
    Task<AdvancedAnalyticsDto> GetAdvancedAnalyticsAsync();
}
