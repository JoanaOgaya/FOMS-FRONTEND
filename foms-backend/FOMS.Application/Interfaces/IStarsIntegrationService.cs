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
}
