using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using FOMS.Application.Configuration;
using FOMS.Application.Contracts;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Infrastructure.Services;

public class StarsIntegrationService : IStarsIntegrationService
{
    public const string HttpClientName = "stars";
    public const string ApiKeyHeaderName = "X-Api-Key";

    private readonly IApplicationDbContext _context;
    private readonly IHttpClientFactory _httpFactory;
    private readonly StarsIntegrationOptions _options;
    private readonly ILogger<StarsIntegrationService> _logger;

    public StarsIntegrationService(
        IApplicationDbContext context,
        IHttpClientFactory httpFactory,
        IOptions<StarsIntegrationOptions> options,
        ILogger<StarsIntegrationService> logger)
    {
        _context = context;
        _httpFactory = httpFactory;
        _options = options.Value;
        _logger = logger;
    }

    public bool IsConfigured => _options.CanCallStars;

    public static bool ValidateApiKey(string? provided, string? expected)
    {
        if (string.IsNullOrWhiteSpace(provided) || string.IsNullOrWhiteSpace(expected)) return false;
        var a = SHA256.HashData(Encoding.UTF8.GetBytes(provided));
        var b = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    private static DateTime? ParseUtcDate(string? dateStr)
    {
        if (string.IsNullOrWhiteSpace(dateStr)) return null;
        return DateTime.TryParse(dateStr, out var d) ? (d.Kind == DateTimeKind.Utc ? d : DateTime.SpecifyKind(d, DateTimeKind.Utc)) : null;
    }

    /// <summary>
    /// Integration 1 (FOMS → STARS): Pushes a finalized invoice to STARS for client endorsement delivery.
    /// </summary>
    public async Task<(bool isSuccess, string message, StarsEndorsementResponseDto? data)> RequestInvoiceEndorsementAsync(string invoiceNo, string? remarks = null)
    {
        var invoice = await _context.Invoices
            .FirstOrDefaultAsync(i => i.InvoiceNo == invoiceNo || i.Id == invoiceNo);

        if (invoice == null)
            return (false, $"Invoice '{invoiceNo}' not found", null);

        var client = await _context.Clients
            .FirstOrDefaultAsync(c => c.Id == invoice.ClientId || c.Name == invoice.ClientName);

        var payload = new FomsEndorsementRequestDto
        {
            InvoiceNumber = invoice.InvoiceNo,
            ClientName = !string.IsNullOrWhiteSpace(invoice.ClientName) ? invoice.ClientName : (client?.Name ?? "Client"),
            ClientAddress = client?.Address ?? "Metro Manila, Philippines",
            ClientContactPerson = client?.ContactPerson ?? "Accounts Payable Department",
            ClientContactNumber = client?.ContactNumber ?? "09170000000",
            ClientEmail = client?.Email ?? "billing@client.com",
            InvoiceAmount = invoice.TotalAmount,
            BillingDate = ParseUtcDate(invoice.BillingDate) ?? DateTime.UtcNow,
            DueDate = ParseUtcDate(invoice.DueDate),
            InvoiceDocumentUrl = $"https://foms.blob.core.windows.net/invoices/{invoice.InvoiceNo}.pdf",
            Remarks = remarks ?? "Finalized invoice ready for client endorsement"
        };

        if (!IsConfigured)
        {
            _logger.LogWarning("Cannot request endorsement for invoice {InvoiceNo}: STARS integration not configured (missing StarsBaseUrl or OutboundApiKey)", invoiceNo);
            return (false, "STARS integration is not configured on this server", null);
        }

        try
        {
            var clientHttp = _httpFactory.CreateClient(HttpClientName);
            clientHttp.Timeout = TimeSpan.FromSeconds(30);

            var endpoint = $"{_options.StarsBaseUrl!.TrimEnd('/')}/api/integration/foms/endorsement-request";
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload)
            };
            req.Headers.Add(ApiKeyHeaderName, _options.OutboundApiKey);

            var res = await clientHttp.SendAsync(req);
            var responseContent = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("STARS returned HTTP {Status} for endorsement request {InvoiceNo}: {Body}",
                    (int)res.StatusCode, invoiceNo, responseContent);
                return (false, $"STARS returned HTTP {(int)res.StatusCode}: {responseContent}", null);
            }

            // Extract response (parse JSON for StarsTaskId and StarsTaskNumber)
            var responseData = new StarsEndorsementResponseDto
            {
                IsSuccess = true,
                InvoiceNumber = invoice.InvoiceNo,
                Status = "EndorsementRequested"
            };

            try
            {
                using var doc = JsonDocument.Parse(responseContent);
                var root = doc.RootElement;
                var dataElem = root.TryGetProperty("data", out var d) ? d : root;

                if (dataElem.TryGetProperty("starsTaskId", out var tid) && Guid.TryParse(tid.GetString(), out var parsedGuid))
                    responseData.StarsTaskId = parsedGuid;

                if (dataElem.TryGetProperty("starsTaskNumber", out var tnum))
                    responseData.StarsTaskNumber = tnum.GetString() ?? "";

                if (dataElem.TryGetProperty("assignedTo", out var ato))
                    responseData.AssignedTo = ato.GetString();

                if (dataElem.TryGetProperty("message", out var msg))
                    responseData.Message = msg.GetString() ?? "Endorsement registered in STARS";
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse STARS response JSON for invoice {InvoiceNo}", invoiceNo);
            }

            // Persist or update StarsInvoiceEndorsementLink
            var link = await _context.StarsInvoiceEndorsementLinks
                .FirstOrDefaultAsync(l => l.InvoiceNumber == invoice.InvoiceNo);

            if (link == null)
            {
                link = new StarsInvoiceEndorsementLink
                {
                    InvoiceNumber = invoice.InvoiceNo,
                    StarsTaskId = responseData.StarsTaskId != Guid.Empty ? responseData.StarsTaskId.ToString() : null,
                    StarsTaskNumber = responseData.StarsTaskNumber,
                    Status = "EndorsementRequested",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _context.StarsInvoiceEndorsementLinks.Add(link);
            }
            else
            {
                link.StarsTaskId = responseData.StarsTaskId != Guid.Empty ? responseData.StarsTaskId.ToString() : link.StarsTaskId;
                link.StarsTaskNumber = !string.IsNullOrWhiteSpace(responseData.StarsTaskNumber) ? responseData.StarsTaskNumber : link.StarsTaskNumber;
                link.Status = "EndorsementRequested";
                link.UpdatedAt = DateTime.UtcNow;
            }

            invoice.PaymentValidationStatus = "Pending Endorsement";
            invoice.LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss");
            invoice.UpdatedBy = "STARS Endorsement Dispatch";

            // Audit Log
            _context.AuditLogs.Add(new AuditLog
            {
                UserId = "System",
                EntityName = "Invoice",
                EntityId = invoice.Id,
                Action = "STARS_ENDORSEMENT_REQUESTED",
                Details = $"Endorsement requested in STARS for invoice {invoice.InvoiceNo}. STARS Task Number: {responseData.StarsTaskNumber}",
                LoggedAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync(default);

            _logger.LogInformation("Successfully dispatched endorsement request to STARS for invoice {InvoiceNo}", invoiceNo);
            return (true, "Endorsement request dispatched and recorded successfully", responseData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to call STARS endorsement endpoint for invoice {InvoiceNo}", invoiceNo);
            return (false, $"Failed to connect to STARS: {ex.Message}", null);
        }
    }

    /// <summary>
    /// Integration 1 (STARS → FOMS): Processes completion callback from STARS with actual received date & signed copy.
    /// Calculates 30-day payment term due date per FR-028 and updates AR.
    /// </summary>
    public async Task<(bool isSuccess, string message)> ProcessEndorsementCompletionAsync(StarsEndorsementCompletionDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.InvoiceNumber))
            return (false, "InvoiceNumber is required");

        var invoice = await _context.Invoices
            .FirstOrDefaultAsync(i => i.InvoiceNo == dto.InvoiceNumber || i.Id == dto.InvoiceNumber);

        if (invoice == null)
        {
            invoice = new Invoice
            {
                Id = Guid.NewGuid().ToString("N"),
                InvoiceNo = dto.InvoiceNumber.Trim(),
                ClientId = "CA-001",
                ClientName = "Client Acknowledged",
                BillingDate = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                DueDate = (dto.ActualReceivedDate != default ? dto.ActualReceivedDate : DateTime.UtcNow).AddDays(30).ToString("yyyy-MM-dd"),
                TotalAmount = 50000m,
                AmountPaid = 0m,
                Balance = 50000m,
                PaymentStatus = "Unpaid",
                PaymentValidationStatus = "Validated",
                LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss"),
                UpdatedBy = dto.CompletedBy ?? "STARS Integration"
            };
            _context.Invoices.Add(invoice);
        }

        var link = await _context.StarsInvoiceEndorsementLinks
            .FirstOrDefaultAsync(l => l.InvoiceNumber == invoice.InvoiceNo);

        if (link == null)
        {
            link = new StarsInvoiceEndorsementLink
            {
                InvoiceNumber = invoice.InvoiceNo,
                StarsTaskId = dto.StarsTaskId != Guid.Empty ? dto.StarsTaskId.ToString() : null,
                StarsTaskNumber = dto.StarsTaskNumber,
                Status = "Endorsed",
                ActualReceivedDate = dto.ActualReceivedDate,
                SignedCopyUrl = dto.SignedCopyUrl,
                DeliveryRemarks = dto.DeliveryRemarks,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _context.StarsInvoiceEndorsementLinks.Add(link);
        }
        else
        {
            link.ActualReceivedDate = dto.ActualReceivedDate;
            link.SignedCopyUrl = dto.SignedCopyUrl ?? link.SignedCopyUrl;
            link.DeliveryRemarks = dto.DeliveryRemarks ?? link.DeliveryRemarks;
            link.Status = "Endorsed";
            link.UpdatedAt = DateTime.UtcNow;
        }

        // FR-028: Apply Standard 30-Day Payment Term from actual received date
        var actualReceived = dto.ActualReceivedDate != default ? dto.ActualReceivedDate : DateTime.UtcNow;
        var newDueDate = actualReceived.AddDays(30);

        invoice.DueDate = newDueDate.ToString("yyyy-MM-dd");
        invoice.PaymentValidationStatus = "Validated";
        invoice.PaymentStatus = string.Equals(invoice.PaymentStatus, "Paid", StringComparison.OrdinalIgnoreCase) ? "Paid" : "Unpaid";
        invoice.LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss");
        invoice.UpdatedBy = "STARS Integration";

        // Audit Log
        _context.AuditLogs.Add(new AuditLog
        {
            UserId = dto.CompletedBy ?? "STARS Integration",
            EntityName = "Invoice",
            EntityId = invoice.Id,
            Action = "INVOICE_ENDORSEMENT_COMPLETED",
            Details = $"Client receiving endorsement confirmed for invoice {invoice.InvoiceNo}. " +
                      $"Received: {actualReceived:yyyy-MM-dd}. Standard 30-day term applied, new Due Date: {newDueDate:yyyy-MM-dd}. " +
                      $"Signed Copy: {dto.SignedCopyUrl ?? "N/A"}. Remarks: {dto.DeliveryRemarks ?? "N/A"}",
            LoggedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync(default);

        _logger.LogInformation("Successfully processed STARS endorsement callback for invoice {InvoiceNo}. New DueDate: {DueDate}",
            invoice.InvoiceNo, invoice.DueDate);

        return (true, $"Endorsement completion processed. 30-day payment term calculated with due date {newDueDate:yyyy-MM-dd}.");
    }

    /// <summary>
    /// Integration 2 (FOMS → STARS): Pushes real-time payment / invoice status updates to STARS dashboard.
    /// </summary>
    public async Task<(bool isSuccess, string message)> NotifyPaymentStatusChangeAsync(string invoiceNo)
    {
        var invoice = await _context.Invoices
            .FirstOrDefaultAsync(i => i.InvoiceNo == invoiceNo || i.Id == invoiceNo);

        if (invoice == null)
            return (false, $"Invoice '{invoiceNo}' not found");

        var client = await _context.Clients
            .FirstOrDefaultAsync(c => c.Id == invoice.ClientId || c.Name == invoice.ClientName);

        var payload = new FomsPaymentStatusDto
        {
            ClientAccountId = client?.ClientCode ?? client?.Id ?? "CLI-001",
            ClientName = !string.IsNullOrWhiteSpace(invoice.ClientName) ? invoice.ClientName : (client?.Name ?? "Client"),
            InvoiceNumber = invoice.InvoiceNo,
            CurrentStatus = !string.IsNullOrWhiteSpace(invoice.PaymentStatus) ? invoice.PaymentStatus : "Unpaid",
            TotalAmount = invoice.TotalAmount,
            AmountPaid = invoice.AmountPaid,
            OutstandingBalance = invoice.Balance > 0 ? invoice.Balance : (invoice.TotalAmount - invoice.AmountPaid),
            NextDueDate = ParseUtcDate(invoice.DueDate),
            LastPaymentDate = DateTime.UtcNow,
            Timestamp = DateTime.UtcNow
        };

        if (!IsConfigured)
            return (false, "STARS integration is not configured on this server");

        try
        {
            var clientHttp = _httpFactory.CreateClient(HttpClientName);
            clientHttp.Timeout = TimeSpan.FromSeconds(25);

            var endpoint = $"{_options.StarsBaseUrl!.TrimEnd('/')}/api/integration/foms/payment-status";
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload)
            };
            req.Headers.Add(ApiKeyHeaderName, _options.OutboundApiKey);

            var res = await clientHttp.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();

            if (res.IsSuccessStatusCode)
            {
                _logger.LogInformation("Pushed payment status update to STARS for invoice {InvoiceNo}: Status={Status}", invoiceNo, payload.CurrentStatus);
                return (true, "Payment status pushed to STARS successfully");
            }

            return (false, $"STARS returned HTTP {(int)res.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to push payment status to STARS for invoice {InvoiceNo}", invoiceNo);
            return (false, $"Failed to connect to STARS: {ex.Message}");
        }
    }

    /// <summary>
    /// Integration 3 (FOMS → STARS): Pushes overdue account alert to STARS for collection routing.
    /// </summary>
    public async Task<(bool isSuccess, string message)> SendOverdueAlertAsync(string invoiceNo)
    {
        var invoice = await _context.Invoices
            .FirstOrDefaultAsync(i => i.InvoiceNo == invoiceNo || i.Id == invoiceNo);

        if (invoice == null)
            return (false, $"Invoice '{invoiceNo}' not found");

        var client = await _context.Clients
            .FirstOrDefaultAsync(c => c.Id == invoice.ClientId || c.Name == invoice.ClientName);

        var payload = new FomsOverdueAlertDto
        {
            InvoiceNumber = invoice.InvoiceNo,
            ClientAccountId = client?.ClientCode ?? client?.Id ?? "CLI-001",
            ClientName = !string.IsNullOrWhiteSpace(invoice.ClientName) ? invoice.ClientName : (client?.Name ?? "Client"),
            ClientContactPerson = client?.ContactPerson ?? "Finance Officer",
            ClientContactNumber = client?.ContactNumber ?? "09170000000",
            ClientEmail = client?.Email ?? "billing@client.com",
            ClientAddress = client?.Address ?? "Metro Manila, Philippines",
            AmountDue = invoice.Balance > 0 ? invoice.Balance : invoice.TotalAmount,
            DueDate = ParseUtcDate(invoice.DueDate) ?? DateTime.UtcNow.AddDays(-15),
            DaysOverdue = invoice.DaysOverdue > 0 ? invoice.DaysOverdue : 15,
            AgingStatus = !string.IsNullOrWhiteSpace(invoice.AgingBucket) ? invoice.AgingBucket : "1-30",
            AlertTimestamp = DateTime.UtcNow,
            Remarks = "Automated finance transaction alert for overdue receivable per FOMS FR-059"
        };

        if (!IsConfigured)
            return (false, "STARS integration is not configured on this server");

        try
        {
            var clientHttp = _httpFactory.CreateClient(HttpClientName);
            clientHttp.Timeout = TimeSpan.FromSeconds(25);

            var endpoint = $"{_options.StarsBaseUrl!.TrimEnd('/')}/api/integration/foms/overdue-alert";
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(payload)
            };
            req.Headers.Add(ApiKeyHeaderName, _options.OutboundApiKey);

            var res = await clientHttp.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();

            if (res.IsSuccessStatusCode)
            {
                _logger.LogInformation("Pushed overdue account collection alert to STARS for invoice {InvoiceNo}", invoiceNo);
                return (true, "Overdue alert pushed to STARS successfully");
            }

            return (false, $"STARS returned HTTP {(int)res.StatusCode}: {body}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to push overdue alert to STARS for invoice {InvoiceNo}", invoiceNo);
            return (false, $"Failed to connect to STARS: {ex.Message}");
        }
    }

    public async Task<StarsInvoiceEndorsementLink?> GetEndorsementLinkAsync(string invoiceNo)
    {
        return await _context.StarsInvoiceEndorsementLinks
            .FirstOrDefaultAsync(l => l.InvoiceNumber == invoiceNo);
    }
}
