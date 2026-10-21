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
    private readonly FomsDbContext? _fomsDb;
    private readonly IHttpClientFactory _httpFactory;
    private readonly StarsIntegrationOptions _options;
    private readonly ILogger<StarsIntegrationService> _logger;

    public StarsIntegrationService(
        IApplicationDbContext context,
        IHttpClientFactory httpFactory,
        IOptions<StarsIntegrationOptions> options,
        ILogger<StarsIntegrationService> logger,
        FomsDbContext? fomsDb = null)
    {
        _context = context;
        _httpFactory = httpFactory;
        _options = options.Value;
        _logger = logger;
        _fomsDb = fomsDb;
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

    /// <summary>
    /// STARS Graph Routing Engine: Evaluates finance team workload/availability and identifies optimal Coordinator.
    /// </summary>
    public async Task<List<StarsCoordinatorRoutingMetricDto>> EvaluateCoordinatorGraphRoutingAsync()
    {
        var metrics = new List<StarsCoordinatorRoutingMetricDto>();
        if (_fomsDb == null) return metrics;

        // Query coordinators from Users table (role_id = 5 or coordinator)
        var coordinators = await _fomsDb.Users
            .Where(u => u.RoleId == 5 || (u.IsActive == true && (u.EmployeeNumber == "EMP-006" || u.EmployeeNumber == "EMP-007" || u.EmployeeNumber == "EMP-004")))
            .ToListAsync();

        if (!coordinators.Any())
        {
            // Fallback coordinators if none explicitly seeded
            coordinators = new List<FOMS.Domain.Entities.SqlServer.User>
            {
                new() { EmployeeNumber = "EMP-006", FullName = "Joana Marie Chan Ogaya", RoleId = 5, IsActive = true },
                new() { EmployeeNumber = "EMP-007", FullName = "Mark Anthony Santos", RoleId = 5, IsActive = true }
            };
        }

        var existingTasks = await _fomsDb.StarsCollectionTasks.AsNoTracking().ToListAsync();

        foreach (var c in coordinators)
        {
            var empNum = c.EmployeeNumber ?? $"EMP-{c.UserId:D3}";
            var userTasks = existingTasks.Where(t => t.AssignedCoordinatorId == empNum || t.AssignedCoordinatorName == c.FullName).ToList();

            var active = userTasks.Count(t => t.Status == "Assigned" || t.Status == "In Progress");
            var overdue = userTasks.Count(t => (t.Status == "Assigned" || t.Status == "In Progress") && t.DaysOverdue > 15);
            var completed = userTasks.Count(t => t.Status == "Completed");

            // Workload Graph formula: Active tasks + weighted overdue tasks
            var workloadScore = (active * 15m) + (overdue * 25m);
            var availability = Math.Max(5m, 100m - workloadScore);

            metrics.Add(new StarsCoordinatorRoutingMetricDto
            {
                CoordinatorId = empNum,
                FullName = c.FullName,
                ActiveTasksCount = active,
                OverdueTasksCount = overdue,
                CompletedTasksCount = completed,
                WorkloadScore = workloadScore,
                AvailabilityPercentage = availability,
                IsOptimalCandidate = false
            });
        }

        // Tag the optimal candidate with lowest workload score (highest availability)
        var optimal = metrics.OrderBy(m => m.WorkloadScore).ThenByDescending(m => m.AvailabilityPercentage).FirstOrDefault();
        if (optimal != null)
        {
            optimal.IsOptimalCandidate = true;
        }

        return metrics;
    }

    /// <summary>
    /// STARS intercepts payload and automatically creates a "Collection Follow-up" task using the Graph Routing Engine.
    /// </summary>
    public async Task<(bool isSuccess, string message, StarsCollectionTaskDto? data)> CreateCollectionFollowUpTaskAsync(StarsCollectionTaskRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.InvoiceNumber))
            return (false, "InvoiceNumber is required", null);

        if (_fomsDb == null)
            return (false, "Database connection not available", null);

        // Fetch invoice details for context
        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.InvoiceNo == dto.InvoiceNumber || i.Id == dto.InvoiceNumber);

        var amountDue = dto.AmountDue ?? (invoice?.Balance > 0 ? invoice.Balance : (invoice?.TotalAmount ?? 0m));
        var clientName = dto.ClientName ?? invoice?.ClientName ?? "Client";
        var daysOverdue = dto.DaysOverdue ?? invoice?.DaysOverdue ?? 0;

        // Run STARS Graph Routing Engine to find optimal Coordinator
        var routingMetrics = await EvaluateCoordinatorGraphRoutingAsync();
        var selectedCoordinator = routingMetrics.FirstOrDefault(m => m.CoordinatorId == dto.PreferredCoordinatorId)
                                  ?? routingMetrics.FirstOrDefault(m => m.IsOptimalCandidate)
                                  ?? routingMetrics.FirstOrDefault();

        var coordId = selectedCoordinator?.CoordinatorId ?? "EMP-006";
        var coordName = selectedCoordinator?.FullName ?? "Joana Marie Chan Ogaya";
        var score = selectedCoordinator?.WorkloadScore ?? 0m;
        var avail = selectedCoordinator?.AvailabilityPercentage ?? 100m;

        var taskNumber = $"TASK-COL-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..4].ToUpper()}";
        var reason = $"STARS Graph Routing Engine: Evaluated lowest workload score ({score:F1}) and highest availability ({avail:F0}%) for optimal task completion.";

        var task = new FOMS.Domain.Entities.SqlServer.StarsCollectionTask
        {
            TaskNumber = taskNumber,
            TaskType = "Collection Follow-up",
            InvoiceNumber = dto.InvoiceNumber,
            ClientName = clientName,
            AmountDue = amountDue,
            DaysOverdue = daysOverdue,
            AssignedCoordinatorId = coordId,
            AssignedCoordinatorName = coordName,
            RoutingScore = score,
            RoutingReason = reason,
            Status = "Assigned",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _fomsDb.StarsCollectionTasks.Add(task);

        // Synchronize with AccountsReceivable in FOMS_DB
        string? targetInvoiceId = invoice?.Id;
        string invoiceNum = dto.InvoiceNumber;
        var ar = await _fomsDb.AccountsReceivable
            .FirstOrDefaultAsync(r => (targetInvoiceId != null && r.InvoiceId.ToString() == targetInvoiceId) || r.ArId.ToString() == invoiceNum);
        if (ar != null)
        {
            ar.CollectionPriority = $"High (STARS Task: {taskNumber})";
            ar.UpdatedAt = DateTime.UtcNow;
        }

        // Audit Trail
        _fomsDb.AuditLogs.Add(new FOMS.Domain.Entities.SqlServer.AuditLog
        {
            role = "STARS Routing Engine",
            action = "STARS_COLLECTION_TASK_CREATED",
            module = "STARS Integration",
            remarks = $"STARS created Collection Follow-up task {taskNumber} for Invoice {dto.InvoiceNumber} (₱{amountDue:N2}, {daysOverdue} days overdue). Routed to Coordinator {coordName} ({coordId}) based on availability.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        var resultDto = new StarsCollectionTaskDto
        {
            TaskId = task.TaskId,
            TaskNumber = task.TaskNumber,
            TaskType = task.TaskType,
            InvoiceNumber = task.InvoiceNumber,
            ClientName = task.ClientName,
            AmountDue = task.AmountDue,
            DaysOverdue = task.DaysOverdue,
            AssignedCoordinatorId = task.AssignedCoordinatorId,
            AssignedCoordinatorName = task.AssignedCoordinatorName,
            RoutingScore = task.RoutingScore,
            RoutingReason = task.RoutingReason,
            Status = task.Status,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt
        };

        _logger.LogInformation("STARS Collection Follow-up task {TaskNumber} created and routed to {Coordinator}", taskNumber, coordName);
        return (true, $"Collection Follow-up task {taskNumber} created and routed to {coordName}.", resultDto);
    }

    /// <summary>
    /// Coordinator executes collection follow-up workflow inside STARS.
    /// </summary>
    public async Task<(bool isSuccess, string message, StarsCollectionTaskDto? data)> ExecuteCollectionTaskAsync(int taskId, StarsCollectionExecutionDto dto)
    {
        if (_fomsDb == null) return (false, "Database connection not available", null);

        var task = await _fomsDb.StarsCollectionTasks.FirstOrDefaultAsync(t => t.TaskId == taskId);
        if (task == null)
            return (false, $"STARS Collection task with ID {taskId} not found", null);

        task.ActionTaken = dto.ActionTaken;
        task.Outcome = dto.Outcome;
        task.PromisedPaymentDate = dto.PromisedPaymentDate;
        task.ExecutionNotes = dto.Notes;
        task.ExecutedAt = DateTime.UtcNow;
        task.ExecutedBy = dto.ExecutedBy ?? task.AssignedCoordinatorName;
        task.Status = "Completed";
        task.UpdatedAt = DateTime.UtcNow;

        // Synchronize outcome back to AccountsReceivable
        var ar = await _fomsDb.AccountsReceivable.FirstOrDefaultAsync(r => r.InvoiceId.ToString() == task.InvoiceNumber);
        if (ar != null)
        {
            if (dto.Outcome == "Promised to Pay")
            {
                ar.ArStatus = "Promised to Pay";
                ar.CollectionPriority = "Promised to Pay (" + (dto.PromisedPaymentDate?.ToString("yyyy-MM-dd") ?? "Pending") + ")";
            }
            else if (dto.Outcome == "Disputed")
            {
                ar.ArStatus = "Disputed";
                ar.CollectionPriority = "Disputed - For Billing Review";
            }
            else if (dto.Outcome == "Escalated to Legal")
            {
                ar.CollectionPriority = "Legal Escalation";
            }
            ar.UpdatedAt = DateTime.UtcNow;
        }

        // Audit Trail
        _fomsDb.AuditLogs.Add(new FOMS.Domain.Entities.SqlServer.AuditLog
        {
            role = "STARS Coordinator",
            action = "STARS_COLLECTION_TASK_EXECUTED",
            module = "STARS Integration",
            affected_record_id = task.TaskId,
            remarks = $"Coordinator {task.ExecutedBy} executed collection follow-up on task {task.TaskNumber}. Action: {dto.ActionTaken}. Outcome: {dto.Outcome}. Promised Date: {dto.PromisedPaymentDate:yyyy-MM-dd}.",
            created_at = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        var resultDto = new StarsCollectionTaskDto
        {
            TaskId = task.TaskId,
            TaskNumber = task.TaskNumber,
            TaskType = task.TaskType,
            InvoiceNumber = task.InvoiceNumber,
            ClientName = task.ClientName,
            AmountDue = task.AmountDue,
            DaysOverdue = task.DaysOverdue,
            AssignedCoordinatorId = task.AssignedCoordinatorId,
            AssignedCoordinatorName = task.AssignedCoordinatorName,
            RoutingScore = task.RoutingScore,
            RoutingReason = task.RoutingReason,
            Status = task.Status,
            ActionTaken = task.ActionTaken,
            Outcome = task.Outcome,
            PromisedPaymentDate = task.PromisedPaymentDate,
            ExecutionNotes = task.ExecutionNotes,
            ExecutedAt = task.ExecutedAt,
            ExecutedBy = task.ExecutedBy,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt
        };

        return (true, $"Collection task {task.TaskNumber} executed successfully.", resultDto);
    }

    /// <summary>
    /// Retrieves collection follow-up tasks from STARS.
    /// </summary>
    public async Task<List<StarsCollectionTaskDto>> GetCollectionTasksAsync(string? status = null)
    {
        if (_fomsDb == null) return new List<StarsCollectionTaskDto>();

        var query = _fomsDb.StarsCollectionTasks.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(t => t.Status == status);

        var list = await query.OrderByDescending(t => t.CreatedAt).ToListAsync();

        return list.Select(task => new StarsCollectionTaskDto
        {
            TaskId = task.TaskId,
            TaskNumber = task.TaskNumber,
            TaskType = task.TaskType,
            InvoiceNumber = task.InvoiceNumber,
            ClientName = task.ClientName,
            AmountDue = task.AmountDue,
            DaysOverdue = task.DaysOverdue,
            AssignedCoordinatorId = task.AssignedCoordinatorId,
            AssignedCoordinatorName = task.AssignedCoordinatorName,
            RoutingScore = task.RoutingScore,
            RoutingReason = task.RoutingReason,
            Status = task.Status,
            ActionTaken = task.ActionTaken,
            Outcome = task.Outcome,
            PromisedPaymentDate = task.PromisedPaymentDate,
            ExecutionNotes = task.ExecutionNotes,
            ExecutedAt = task.ExecutedAt,
            ExecutedBy = task.ExecutedBy,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt
        }).ToList();
    }

    public async Task<(bool exists, string message)> CheckUserExistsInStarsAsync(string? email, string? employeeId = null)
    {
        if (!IsConfigured)
            return (false, "STARS integration is not configured on this server");

        try
        {
            var clientHttp = _httpFactory.CreateClient(HttpClientName);
            clientHttp.Timeout = TimeSpan.FromSeconds(10);

            var query = new System.Collections.Generic.List<string>();
            if (!string.IsNullOrWhiteSpace(email)) query.Add($"email={Uri.EscapeDataString(email.Trim())}");
            if (!string.IsNullOrWhiteSpace(employeeId)) query.Add($"employeeNumber={Uri.EscapeDataString(employeeId.Trim())}");
            var queryString = string.Join("&", query);

            var endpoint = $"{_options.StarsBaseUrl!.TrimEnd('/')}/api/integration/check-user-exists?{queryString}";
            using var req = new HttpRequestMessage(HttpMethod.Get, endpoint);
            req.Headers.Add(ApiKeyHeaderName, _options.OutboundApiKey);

            var res = await clientHttp.SendAsync(req);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadFromJsonAsync<JsonElement>();
                if (body.TryGetProperty("exists", out var existsProp) && existsProp.GetBoolean())
                {
                    var matched = body.TryGetProperty("matchedBy", out var m) ? m.GetString() : "email";
                    return (true, $"User already exists in STARS (matched by {matched}).");
                }
                return (false, "Available");
            }

            return (false, $"STARS check returned HTTP {(int)res.StatusCode}");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to query STARS for user uniqueness check");
            return (false, $"STARS check skipped: {ex.Message}");
        }
    }
}
