using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/approvals")]
[Route("approvals")]
public class ApprovalsController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;
    private readonly ILogger<ApprovalsController> _logger;

    public ApprovalsController(FomsDbContext fomsDb, ILogger<ApprovalsController> logger)
    {
        _fomsDb = fomsDb;
        _logger = logger;
    }

    private (int userId, string username, string role, string employeeId) GetCurrentUserInfo()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value
                ?? User.FindFirst("role")?.Value
                ?? "Assistant Financial Manager";

        var username = User.FindFirst(ClaimTypes.Name)?.Value
                    ?? User.FindFirst("name")?.Value
                    ?? User.Identity?.Name
                    ?? "Finance Officer";

        var employeeId = User.FindFirst("employee_id")?.Value
                      ?? User.FindFirst("employee_number")?.Value
                      ?? User.FindFirst("sub")?.Value
                      ?? username;

        var userIdClaim = User.FindFirst("user_id")?.Value
                       ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        int userId = 1;
        if (int.TryParse(userIdClaim, out var parsed))
        {
            userId = parsed;
        }

        return (userId, username, role, employeeId);
    }

    private static string MapToFrontendStatus(string status)
    {
        return status switch
        {
            "Pending Assistant Review" => "Submitted",
            "Pending Financial Manager Approval" => "PendingFinanceManager",
            "Approved by Assistant" => "Approved",
            "Approved by Financial Manager" => "Approved",
            "Rejected by Assistant" => "ReturnedForRevision",
            "Rejected by Financial Manager" => "ReturnedForRevision",
            "Returned for Correction" => "ReturnedForRevision",
            _ => status
        };
    }

    /// <summary>
    /// TC-005, TC-006, TC-012, TC-019:
    /// Fetch pending approval items with filters (entityType, status, level, page, pageSize)
    /// </summary>
    [HttpGet("pending")]
    public async Task<IActionResult> GetPending(
        [FromQuery] string? entityType,
        [FromQuery] string? status,
        [FromQuery] string? level,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        var query = _fomsDb.CashOutflowApprovalRequests.AsNoTracking().AsQueryable();

        // 1. Filter by Level
        if (!string.IsNullOrWhiteSpace(level))
        {
            if (string.Equals(level, "FinanceManager", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(level, "Level 2", StringComparison.OrdinalIgnoreCase) ||
                level == "2")
            {
                query = query.Where(r => r.ApprovalLevel == "Level 2" || r.IsEscalated || r.Status == "Pending Financial Manager Approval");
            }
            else if (string.Equals(level, "AssistantFinanceManager", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(level, "Level 1", StringComparison.OrdinalIgnoreCase) ||
                     level == "1")
            {
                query = query.Where(r => r.ApprovalLevel == "Level 1" && !r.IsEscalated);
            }
        }

        // 2. Filter by Status
        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "ALL", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(status, "PendingFinanceManager", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(r => r.Status == "Pending Financial Manager Approval" || (r.IsEscalated && r.Status != "Approved by Financial Manager" && r.Status != "Rejected by Financial Manager"));
            }
            else if (string.Equals(status, "Submitted", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(r => r.Status == "Pending Assistant Review" || r.Status == "Submitted");
            }
            else if (string.Equals(status, "Approved", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(r => r.Status == "Approved by Assistant" || r.Status == "Approved by Financial Manager" || r.Status == "Approved");
            }
            else if (string.Equals(status, "ReturnedForRevision", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(status, "Returned", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(r => r.Status == "Returned for Correction" || r.Status == "Rejected by Assistant" || r.Status == "Rejected by Financial Manager");
            }
            else
            {
                query = query.Where(r => r.Status == status);
            }
        }

        // 3. Filter by Entity Type
        if (!string.IsNullOrWhiteSpace(entityType) && !string.Equals(entityType, "ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(r => r.Category == entityType || r.Category!.Contains(entityType));
        }

        var total = await query.CountAsync();
        var records = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((Math.Max(1, page) - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = records.Select(r => new
        {
            id = r.RequestGuid,
            entityType = r.Category ?? "CashOutflow",
            entityId = r.CashOutflowId,
            referenceNo = r.TransactionReference,
            referenceNumber = r.TransactionReference,
            amount = r.Amount,
            payee = r.Payee,
            requestedBy = r.SubmittedBy,
            submittedBy = r.SubmittedBy,
            requestedById = r.SubmittedById ?? "EMP-004",
            currentLevel = r.ApprovalLevel == "Level 2" ? "FinanceManager" : "AssistantFinanceManager",
            approvalLevel = r.ApprovalLevel,
            status = MapToFrontendStatus(r.Status),
            rawStatus = r.Status,
            createdAt = r.CreatedAt.ToString("o"),
            updatedAt = r.UpdatedAt.ToString("o"),
            purpose = r.Purpose,
            description = r.Purpose ?? r.Category,
            isEscalated = r.IsEscalated,
            escalationThreshold = r.EscalationThreshold,
            rejectionReason = r.RejectionReason,
            remarks = r.Remarks
        }).ToList();

        return Ok(new
        {
            items,
            total
        });
    }

    /// <summary>
    /// TC-010: Get single approval request by GUID or Reference No.
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var r = await _fomsDb.CashOutflowApprovalRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.RequestGuid == id || x.CashOutflowId == id || x.TransactionReference == id);

        if (r == null && int.TryParse(id, out var intId))
        {
            r = await _fomsDb.CashOutflowApprovalRequests
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.ApprovalRequestId == intId);
        }

        if (r == null)
        {
            return NotFound(new { success = false, message = $"Approval request '{id}' not found." });
        }

        return Ok(new
        {
            id = r.RequestGuid,
            entityType = r.Category ?? "CashOutflow",
            entityId = r.CashOutflowId,
            referenceNo = r.TransactionReference,
            amount = r.Amount,
            requestedBy = r.SubmittedBy,
            requestedById = r.SubmittedById ?? "EMP-004",
            currentLevel = r.ApprovalLevel == "Level 2" ? "FinanceManager" : "AssistantFinanceManager",
            status = MapToFrontendStatus(r.Status),
            createdAt = r.CreatedAt.ToString("o"),
            updatedAt = r.UpdatedAt.ToString("o"),
            purpose = r.Purpose,
            description = r.Purpose ?? r.Category,
            isEscalated = r.IsEscalated,
            escalationThreshold = r.EscalationThreshold,
            rejectionReason = r.RejectionReason,
            remarks = r.Remarks
        });
    }

    /// <summary>
    /// TC-017: Get approval history for request
    /// </summary>
    [HttpGet("{id}/history")]
    public async Task<IActionResult> GetHistory(string id)
    {
        var req = await _fomsDb.CashOutflowApprovalRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.RequestGuid == id || x.CashOutflowId == id || x.TransactionReference == id);

        int requestId = req?.ApprovalRequestId ?? (int.TryParse(id, out var parsedId) ? parsedId : 0);

        if (requestId == 0 && req == null)
        {
            return Ok(new List<object>());
        }

        var history = await _fomsDb.CashOutflowApprovalHistories
            .AsNoTracking()
            .Where(h => h.ApprovalRequestId == requestId)
            .OrderBy(h => h.CreatedAt)
            .ToListAsync();

        var steps = history.Select(h => new
        {
            level = h.ActorRole.Contains("Manager") && !h.ActorRole.Contains("Assistant") ? "Level 2" : "Level 1",
            approverName = h.ActorName ?? h.ActorUserId,
            action = h.Action,
            remarks = h.Remarks ?? string.Empty,
            actedAt = h.CreatedAt.ToString("o")
        }).ToList();

        return Ok(steps);
    }

    /// <summary>
    /// TC-002, TC-004, TC-007, TC-015:
    /// Approve transaction with server-side threshold and role enforcement
    /// </summary>
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> Approve(string id)
    {
        var (userId, username, role, employeeId) = GetCurrentUserInfo();

        var req = await _fomsDb.CashOutflowApprovalRequests
            .FirstOrDefaultAsync(x => x.RequestGuid == id || x.CashOutflowId == id || x.TransactionReference == id);

        if (req == null && int.TryParse(id, out var intId))
        {
            req = await _fomsDb.CashOutflowApprovalRequests.FirstOrDefaultAsync(x => x.ApprovalRequestId == intId);
        }

        if (req == null)
        {
            return NotFound(new { success = false, message = $"Approval request '{id}' not found." });
        }

        // TC-015: Duplicate Click Prevention / Idempotency
        if (req.IsPosted || req.Status == "Approved by Assistant" || req.Status == "Approved by Financial Manager")
        {
            return Conflict(new { success = false, message = "This transaction has already been approved and posted." });
        }

        bool isFm = string.Equals(role, "Financial Manager", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(role, "Finance Manager", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(role, "System Admin", StringComparison.OrdinalIgnoreCase);

        bool isAssistantFm = string.Equals(role, "Assistant Financial Manager", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(role, "Assistant of Financial Manager", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(role, "Assistant Finance Manager", StringComparison.OrdinalIgnoreCase);

        // Fetch active threshold from MSSQL (Section 6)
        var activeThreshold = await _fomsDb.ApprovalThresholdSettings
            .AsNoTracking()
            .Where(t => t.IsActive && (t.TransactionType == "CashOutflow" || t.TransactionType == "All"))
            .OrderByDescending(t => t.UpdatedAt)
            .FirstOrDefaultAsync();

        if (activeThreshold == null)
        {
            _logger.LogError("Approval threshold setting missing in MSSQL for CashOutflow approval attempt.");
            return StatusCode(500, new { success = false, message = "Approval threshold configuration missing in database. Approval blocked per security policy." });
        }

        using var transaction = await _fomsDb.Database.BeginTransactionAsync();
        try
        {
            if (isAssistantFm && !isFm)
            {
                // TC-004: Assistant cannot approve high-value requests exceeding threshold
                if (req.Amount > activeThreshold.MaximumAmount)
                {
                    _logger.LogWarning("Unauthorized approval attempt by Assistant {User}: Amount ₱{Amount} exceeds threshold ₱{Limit}",
                        username, req.Amount, activeThreshold.MaximumAmount);

                    return StatusCode(403, new
                    {
                        success = false,
                        message = $"Transaction amount of ₱{req.Amount:N2} exceeds Assistant Financial Manager authorization limit (₱{activeThreshold.MaximumAmount:N2}). Escalation to Financial Manager is required."
                    });
                }

                // Low-value approval (TC-002)
                var oldStatus = req.Status;
                req.Status = "Approved by Assistant";
                req.ApprovalLevel = "Level 1";
                req.ReviewedBy = username;
                req.ReviewedAt = DateTime.UtcNow;
                req.IsPosted = true;
                req.PostedAt = DateTime.UtcNow;
                req.UpdatedAt = DateTime.UtcNow;

                await PostCashOutflowRecordAsync(req, username, userId);

                _fomsDb.CashOutflowApprovalHistories.Add(new CashOutflowApprovalHistory
                {
                    ApprovalRequestId = req.ApprovalRequestId,
                    ActorUserId = employeeId,
                    ActorName = username,
                    ActorRole = "Assistant Financial Manager",
                    Action = "Approved",
                    PreviousStatus = oldStatus,
                    NewStatus = req.Status,
                    Remarks = $"Approved by Assistant Financial Manager within limit (₱{activeThreshold.MaximumAmount:N2}). Cash outflow posted.",
                    CreatedAt = DateTime.UtcNow
                });

                _fomsDb.AuditLogs.Add(new AuditLog
                {
                    user_id = userId,
                    role = "Assistant Financial Manager",
                    action = "ASSISTANT_APPROVE_CASHOUTFLOW",
                    module = "Cash Outflow Approval",
                    affected_record_type = "CashOutflow",
                    affected_record_id = req.ApprovalRequestId,
                    before_value = oldStatus,
                    after_value = req.Status,
                    remarks = $"Assistant approved cash outflow {req.TransactionReference} of ₱{req.Amount:N2}. Cash outflow posted.",
                    created_at = DateTime.UtcNow
                });

                _fomsDb.Notifications.Add(new Notification
                {
                    Type = "CASH_OUTFLOW_APPROVED",
                    Title = "Cash Outflow Approved by Assistant",
                    Message = $"Cash Outflow {req.TransactionReference} (₱{req.Amount:N2}) approved by {username} and posted.",
                    RecipientRole = "Accountant",
                    IsRead = false,
                    CreatedAt = DateTime.UtcNow
                });
            }
            else if (isFm)
            {
                // TC-007: Financial Manager Approval
                var oldStatus = req.Status;
                req.Status = "Approved by Financial Manager";
                req.ApprovalLevel = "Level 2";
                req.ReviewedBy = username;
                req.ReviewedAt = DateTime.UtcNow;
                req.IsPosted = true;
                req.PostedAt = DateTime.UtcNow;
                req.UpdatedAt = DateTime.UtcNow;

                await PostCashOutflowRecordAsync(req, username, userId);

                _fomsDb.CashOutflowApprovalHistories.Add(new CashOutflowApprovalHistory
                {
                    ApprovalRequestId = req.ApprovalRequestId,
                    ActorUserId = employeeId,
                    ActorName = username,
                    ActorRole = "Financial Manager",
                    Action = "Approved",
                    PreviousStatus = oldStatus,
                    NewStatus = req.Status,
                    Remarks = "Approved by Financial Manager. Cash outflow posted.",
                    CreatedAt = DateTime.UtcNow
                });

                _fomsDb.AuditLogs.Add(new AuditLog
                {
                    user_id = userId,
                    role = "Financial Manager",
                    action = "FM_APPROVE_CASHOUTFLOW",
                    module = "Escalated Approvals",
                    affected_record_type = "CashOutflow",
                    affected_record_id = req.ApprovalRequestId,
                    before_value = oldStatus,
                    after_value = req.Status,
                    remarks = $"Financial Manager approved escalated cash outflow {req.TransactionReference} of ₱{req.Amount:N2}.",
                    created_at = DateTime.UtcNow
                });

                _fomsDb.Notifications.Add(new Notification
                {
                    Type = "CASH_OUTFLOW_APPROVED",
                    Title = "Escalated Outflow Approved",
                    Message = $"Escalated Cash Outflow {req.TransactionReference} (₱{req.Amount:N2}) approved by Financial Manager {username}.",
                    RecipientRole = "Accountant",
                    IsRead = false,
                    CreatedAt = DateTime.UtcNow
                });
            }
            else
            {
                return StatusCode(403, new { success = false, message = "Access denied. Insufficient approval permissions." });
            }

            await _fomsDb.SaveChangesAsync();
            await transaction.CommitAsync();

            return Ok(new
            {
                success = true,
                message = $"Approved {req.TransactionReference} successfully.",
                data = new
                {
                    id = req.RequestGuid,
                    status = MapToFrontendStatus(req.Status),
                    isPosted = req.IsPosted
                }
            });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError(ex, "Failed to approve cash outflow {Id}", id);
            return StatusCode(500, new { success = false, message = $"Failed to process approval: {ex.Message}" });
        }
    }

    /// <summary>
    /// TC-008: Reject cash outflow request with required reason (min 10 characters)
    /// </summary>
    [HttpPost("{id}/reject")]
    public async Task<IActionResult> Reject(string id, [FromBody] System.Text.Json.JsonElement body)
    {
        var (userId, username, role, employeeId) = GetCurrentUserInfo();

        string reason = string.Empty;
        if (body.ValueKind == System.Text.Json.JsonValueKind.Object && body.TryGetProperty("reason", out var rProp))
        {
            reason = rProp.GetString() ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 10)
        {
            return BadRequest(new { success = false, message = "A detailed rejection reason of at least 10 characters is required." });
        }

        var req = await _fomsDb.CashOutflowApprovalRequests
            .FirstOrDefaultAsync(x => x.RequestGuid == id || x.CashOutflowId == id || x.TransactionReference == id);

        if (req == null && int.TryParse(id, out var intId))
        {
            req = await _fomsDb.CashOutflowApprovalRequests.FirstOrDefaultAsync(x => x.ApprovalRequestId == intId);
        }

        if (req == null)
        {
            return NotFound(new { success = false, message = $"Approval request '{id}' not found." });
        }

        var oldStatus = req.Status;
        bool isFm = string.Equals(role, "Financial Manager", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(role, "Finance Manager", StringComparison.OrdinalIgnoreCase);

        req.Status = isFm ? "Rejected by Financial Manager" : "Rejected by Assistant";
        req.RejectionReason = reason.Trim();
        req.ReviewedBy = username;
        req.ReviewedAt = DateTime.UtcNow;
        req.IsPosted = false;
        req.UpdatedAt = DateTime.UtcNow;

        // Also update linked CashOutflows row if exists
        var outflow = await _fomsDb.CashOutflows.FirstOrDefaultAsync(o => o.CashOutflowId == req.CashOutflowId || o.SourceReference == req.TransactionReference);
        if (outflow != null)
        {
            outflow.Status = req.Status;
            outflow.UpdatedAt = DateTime.UtcNow;
        }

        _fomsDb.CashOutflowApprovalHistories.Add(new CashOutflowApprovalHistory
        {
            ApprovalRequestId = req.ApprovalRequestId,
            ActorUserId = employeeId,
            ActorName = username,
            ActorRole = role,
            Action = "Rejected",
            PreviousStatus = oldStatus,
            NewStatus = req.Status,
            Remarks = reason.Trim(),
            CreatedAt = DateTime.UtcNow
        });

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            user_id = userId,
            role = role,
            action = "REJECT_CASHOUTFLOW",
            module = "Approvals",
            affected_record_type = "CashOutflow",
            affected_record_id = req.ApprovalRequestId,
            before_value = oldStatus,
            after_value = req.Status,
            remarks = $"Rejected cash outflow {req.TransactionReference}: {reason.Trim()}",
            created_at = DateTime.UtcNow
        });

        _fomsDb.Notifications.Add(new Notification
        {
            Type = "CASH_OUTFLOW_REJECTED",
            Title = "Cash Outflow Rejected",
            Message = $"Cash Outflow {req.TransactionReference} was rejected by {username}: {reason.Trim()}",
            RecipientRole = "Accountant",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            message = "Transaction rejected successfully.",
            data = new { id = req.RequestGuid, status = MapToFrontendStatus(req.Status) }
        });
    }

    /// <summary>
    /// TC-009: Return for correction
    /// </summary>
    [HttpPost("{id}/return")]
    public async Task<IActionResult> ReturnForCorrection(string id, [FromBody] System.Text.Json.JsonElement body)
    {
        var (userId, username, role, employeeId) = GetCurrentUserInfo();

        string remarks = string.Empty;
        if (body.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            if (body.TryGetProperty("remarks", out var rProp)) remarks = rProp.GetString() ?? string.Empty;
            else if (body.TryGetProperty("reason", out var reaProp)) remarks = reaProp.GetString() ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(remarks) || remarks.Trim().Length < 5)
        {
            return BadRequest(new { success = false, message = "Correction remarks of at least 5 characters are required." });
        }

        var req = await _fomsDb.CashOutflowApprovalRequests
            .FirstOrDefaultAsync(x => x.RequestGuid == id || x.CashOutflowId == id || x.TransactionReference == id);

        if (req == null && int.TryParse(id, out var intId))
        {
            req = await _fomsDb.CashOutflowApprovalRequests.FirstOrDefaultAsync(x => x.ApprovalRequestId == intId);
        }

        if (req == null)
        {
            return NotFound(new { success = false, message = $"Approval request '{id}' not found." });
        }

        var oldStatus = req.Status;
        req.Status = "Returned for Correction";
        req.Remarks = remarks.Trim();
        req.ReviewedBy = username;
        req.ReviewedAt = DateTime.UtcNow;
        req.IsPosted = false;
        req.UpdatedAt = DateTime.UtcNow;

        var outflow = await _fomsDb.CashOutflows.FirstOrDefaultAsync(o => o.CashOutflowId == req.CashOutflowId || o.SourceReference == req.TransactionReference);
        if (outflow != null)
        {
            outflow.Status = "Returned for Correction";
            outflow.UpdatedAt = DateTime.UtcNow;
        }

        _fomsDb.CashOutflowApprovalHistories.Add(new CashOutflowApprovalHistory
        {
            ApprovalRequestId = req.ApprovalRequestId,
            ActorUserId = employeeId,
            ActorName = username,
            ActorRole = role,
            Action = "Returned",
            PreviousStatus = oldStatus,
            NewStatus = req.Status,
            Remarks = remarks.Trim(),
            CreatedAt = DateTime.UtcNow
        });

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            user_id = userId,
            role = role,
            action = "RETURN_CASHOUTFLOW",
            module = "Approvals",
            affected_record_type = "CashOutflow",
            affected_record_id = req.ApprovalRequestId,
            before_value = oldStatus,
            after_value = req.Status,
            remarks = $"Returned cash outflow {req.TransactionReference} for correction: {remarks.Trim()}",
            created_at = DateTime.UtcNow
        });

        _fomsDb.Notifications.Add(new Notification
        {
            Type = "CASH_OUTFLOW_RETURNED",
            Title = "Cash Outflow Returned for Correction",
            Message = $"Cash Outflow {req.TransactionReference} returned by {username}: {remarks.Trim()}",
            RecipientRole = "Accountant",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            message = "Transaction returned for correction.",
            data = new { id = req.RequestGuid, status = MapToFrontendStatus(req.Status) }
        });
    }

    /// <summary>
    /// TC-003, TC-005, TC-014: Assistant Financial Manager escalates high-value transaction to Financial Manager
    /// </summary>
    [HttpPost("{id}/escalate")]
    public async Task<IActionResult> Escalate(string id, [FromBody] System.Text.Json.JsonElement? body)
    {
        var (userId, username, role, employeeId) = GetCurrentUserInfo();

        string reason = "Exceeds Assistant authorization limit. Endorsed for Financial Manager approval.";
        if (body.HasValue && body.Value.ValueKind == System.Text.Json.JsonValueKind.Object && body.Value.TryGetProperty("reason", out var rProp))
        {
            var customReason = rProp.GetString();
            if (!string.IsNullOrWhiteSpace(customReason)) reason = customReason.Trim();
        }

        var req = await _fomsDb.CashOutflowApprovalRequests
            .FirstOrDefaultAsync(x => x.RequestGuid == id || x.CashOutflowId == id || x.TransactionReference == id);

        if (req == null && int.TryParse(id, out var intId))
        {
            req = await _fomsDb.CashOutflowApprovalRequests.FirstOrDefaultAsync(x => x.ApprovalRequestId == intId);
        }

        if (req == null)
        {
            return NotFound(new { success = false, message = $"Approval request '{id}' not found." });
        }

        var oldStatus = req.Status;
        req.Status = "Pending Financial Manager Approval";
        req.ApprovalLevel = "Level 2";
        req.AssignedRole = "Financial Manager";
        req.IsEscalated = true;
        req.EscalatedBy = username;
        req.EscalatedAt = DateTime.UtcNow;
        req.EscalationReason = reason;
        req.UpdatedAt = DateTime.UtcNow;

        var outflow = await _fomsDb.CashOutflows.FirstOrDefaultAsync(o => o.CashOutflowId == req.CashOutflowId || o.SourceReference == req.TransactionReference);
        if (outflow != null)
        {
            outflow.Status = "Pending Financial Manager Approval";
            outflow.ApprovalLevel = "Level 2";
            outflow.AssignedApprover = "Financial Manager";
            outflow.UpdatedAt = DateTime.UtcNow;
        }

        _fomsDb.CashOutflowApprovalHistories.Add(new CashOutflowApprovalHistory
        {
            ApprovalRequestId = req.ApprovalRequestId,
            ActorUserId = employeeId,
            ActorName = username,
            ActorRole = role,
            Action = "Escalated",
            PreviousStatus = oldStatus,
            NewStatus = req.Status,
            Remarks = reason,
            CreatedAt = DateTime.UtcNow
        });

        _fomsDb.AuditLogs.Add(new AuditLog
        {
            user_id = userId,
            role = role,
            action = "ESCALATE_CASHOUTFLOW",
            module = "Approvals",
            affected_record_type = "CashOutflow",
            affected_record_id = req.ApprovalRequestId,
            before_value = oldStatus,
            after_value = req.Status,
            remarks = $"Escalated cash outflow {req.TransactionReference} of ₱{req.Amount:N2} to Financial Manager: {reason}",
            created_at = DateTime.UtcNow
        });

        _fomsDb.Notifications.Add(new Notification
        {
            Type = "CASH_OUTFLOW_ESCALATED",
            Title = "High-Value Cash Outflow Escalated",
            Message = $"Cash Outflow {req.TransactionReference} (₱{req.Amount:N2}) has been escalated to Financial Manager by {username}.",
            RecipientRole = "Financial Manager",
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        });

        await _fomsDb.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            message = "Transaction successfully escalated to Financial Manager.",
            data = new
            {
                id = req.RequestGuid,
                status = MapToFrontendStatus(req.Status),
                isEscalated = true,
                currentLevel = "FinanceManager"
            }
        });
    }

    /// <summary>
    /// Approval Counts for Sidebar Badges and Dashboard KPIs (Rule 3)
    /// </summary>
    [HttpGet("counts")]
    public async Task<IActionResult> GetCounts()
    {
        var (userId, username, role, _) = GetCurrentUserInfo();

        bool isFm = string.Equals(role, "Financial Manager", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(role, "Finance Manager", StringComparison.OrdinalIgnoreCase);

        var allRequests = await _fomsDb.CashOutflowApprovalRequests.AsNoTracking().ToListAsync();

        var pendingCount = allRequests.Count(r => r.Status == "Pending Assistant Review" || r.Status == "Pending Financial Manager Approval" || r.Status == "Submitted");
        var escalatedToFm = allRequests.Count(r => r.IsEscalated && (r.Status == "Pending Financial Manager Approval" || r.Status == "Submitted"));

        int pendingMyApproval;
        if (isFm)
        {
            pendingMyApproval = escalatedToFm;
        }
        else
        {
            pendingMyApproval = allRequests.Count(r => r.Status == "Pending Assistant Review" || (!r.IsEscalated && r.Status == "Submitted"));
        }

        var today = DateTime.UtcNow.Date;
        var approvedToday = allRequests.Count(r => (r.Status == "Approved by Assistant" || r.Status == "Approved by Financial Manager" || r.Status == "Approved") && r.UpdatedAt.Date == today);
        var approvedThisMonth = allRequests.Count(r => (r.Status == "Approved by Assistant" || r.Status == "Approved by Financial Manager" || r.Status == "Approved") && r.UpdatedAt.Month == today.Month && r.UpdatedAt.Year == today.Year);

        return Ok(new
        {
            pendingCount,
            pendingMyApproval,
            approvedToday,
            escalatedToFm,
            approvedThisMonth
        });
    }

    private async Task PostCashOutflowRecordAsync(CashOutflowApprovalRequest req, string username, int userId)
    {
        var existingOutflow = await _fomsDb.CashOutflows.FirstOrDefaultAsync(o => o.CashOutflowId == req.CashOutflowId || o.SourceReference == req.TransactionReference);

        if (existingOutflow != null)
        {
            existingOutflow.Status = "Approved";
            existingOutflow.ApprovedBy = userId;
            existingOutflow.RecordedBy = username;
            existingOutflow.OutflowDate = DateTime.UtcNow;
            existingOutflow.TransactionDate = existingOutflow.TransactionDate ?? DateTime.UtcNow;
            existingOutflow.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            var newOutflow = new CashOutflow
            {
                CashOutflowId = req.CashOutflowId,
                SourceReference = req.TransactionReference,
                Category = req.Category ?? "Disbursement",
                Description = req.Purpose ?? req.TransactionReference,
                Payee = req.Payee,
                Amount = req.Amount,
                Currency = req.Currency,
                Status = "Approved",
                ApprovedBy = userId,
                RecordedBy = username,
                OutflowDate = DateTime.UtcNow,
                TransactionDate = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _fomsDb.CashOutflows.Add(newOutflow);
        }
    }
}
