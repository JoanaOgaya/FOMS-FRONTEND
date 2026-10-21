using System.Threading.Tasks;
using FOMS.Application.Contracts;
using FOMS.Domain.Entities;

namespace FOMS.Application.Interfaces;

public interface IStarsIntegrationService
{
    bool IsConfigured { get; }

    /// <summary>
    /// Integration 1 (FOMS → STARS): Pushes a finalized invoice to STARS for client endorsement delivery.
    /// </summary>
    Task<(bool isSuccess, string message, StarsEndorsementResponseDto? data)> RequestInvoiceEndorsementAsync(string invoiceNo, string? remarks = null);

    /// <summary>
    /// Integration 1 (STARS → FOMS): Processes completion callback from STARS with actual received date & signed copy.
    /// Calculates 30-day payment term due date per FR-028 and updates AR.
    /// </summary>
    Task<(bool isSuccess, string message)> ProcessEndorsementCompletionAsync(StarsEndorsementCompletionDto dto);

    /// <summary>
    /// Integration 2 (FOMS → STARS): Pushes real-time payment / invoice status updates to STARS dashboard.
    /// </summary>
    Task<(bool isSuccess, string message)> NotifyPaymentStatusChangeAsync(string invoiceNo);

    /// <summary>
    /// Integration 3 (FOMS → STARS): Pushes overdue account alert to STARS for collection routing.
    /// </summary>
    Task<(bool isSuccess, string message)> SendOverdueAlertAsync(string invoiceNo);

    /// <summary>
    /// Retrieves the STARS endorsement link record for a given invoice number.
    /// </summary>
    Task<StarsInvoiceEndorsementLink?> GetEndorsementLinkAsync(string invoiceNo);

    /// <summary>
    /// STARS Graph Routing Engine evaluates finance team workload/availability and routes task to optimal Coordinator.
    /// </summary>
    Task<(bool isSuccess, string message, StarsCollectionTaskDto? data)> CreateCollectionFollowUpTaskAsync(StarsCollectionTaskRequestDto dto);

    /// <summary>
    /// Coordinator executes collection follow-up workflow inside STARS.
    /// </summary>
    Task<(bool isSuccess, string message, StarsCollectionTaskDto? data)> ExecuteCollectionTaskAsync(int taskId, StarsCollectionExecutionDto dto);

    /// <summary>
    /// Retrieves collection follow-up tasks from STARS.
    /// </summary>
    Task<System.Collections.Generic.List<StarsCollectionTaskDto>> GetCollectionTasksAsync(string? status = null);

    /// <summary>
    /// Evaluates workload and availability graph routing metrics across all available coordinators.
    /// </summary>
    Task<System.Collections.Generic.List<StarsCoordinatorRoutingMetricDto>> EvaluateCoordinatorGraphRoutingAsync();
    /// Integration Check: queries STARS to check if an email or employee number already exists in STARS.
    /// </summary>
    Task<(bool exists, string message)> CheckUserExistsInStarsAsync(string? email, string? employeeId = null);
}
