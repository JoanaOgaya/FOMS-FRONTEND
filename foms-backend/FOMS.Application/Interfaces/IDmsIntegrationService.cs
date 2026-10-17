using System.Threading.Tasks;
using FOMS.Application.Contracts;

namespace FOMS.Application.Interfaces;

public interface IDmsIntegrationService
{
    bool IsConfigured { get; }

    Task<DmsIntegrationResponseDto> ProcessDeliveryCompletedAsync(DmsDeliveryCompletedDto dto);

    Task<DmsIntegrationResponseDto> ProcessDeliveryFailedAsync(DmsDeliveryFailedDto dto);

    Task<DmsIntegrationResponseDto> ProcessRedeliveryCompletedAsync(DmsRedeliveryCompletedDto dto);

    Task<DmsIntegrationResponseDto> ProcessCashAdvanceRequestAsync(DmsCashAdvanceRequestDto dto);

    Task<DmsIntegrationResponseDto> ProcessLiquidationSubmissionAsync(DmsLiquidationSubmissionDto dto);

    Task<object?> GetWaybillStatusAsync(string waybillNo);
}
