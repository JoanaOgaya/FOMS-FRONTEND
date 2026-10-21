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
[Route("api/cash-outflows")]
[Route("cash-outflows")]
public class CashOutflowsController : ControllerBase
{
    private readonly FomsDbContext _fomsDb;
    private readonly ILogger<CashOutflowsController> _logger;

    public CashOutflowsController(FomsDbContext fomsDb, ILogger<CashOutflowsController> logger)
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

    public class CreateCashOutflowDto
    {
        public string? ReferenceNumber { get; set; }
        public string? Category { get; set; }
        public string? Payee { get; set; }
        public string? Description { get; set; }
        public string? Purpose { get; set; }
        public decimal Amount { get; set; }
        public string? Currency { get; set; } = "PHP";
        public DateTime? TransactionDate { get; set; }
        public string? SupportingDocuments { get; set; }
    }

    /// <summary>
    /// TC-001: Record Cash Outflow Workflow (Section 4)
    /// Validates amount, required fields, reference uniqueness, creates approval request and audit log.
    /// Initial status: Pending Assistant Review
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCashOutflowDto dto)
    {
        var (userId, username, role, employeeId) = GetCurrentUserInfo();

        // 1. Validation: Amount > 0
        if (dto.Amount <= 0)
        {
            return BadRequest(new { success = false, message = "Amount must be greater than zero." });
        }

        // 2. Validation: Required fields
        if (string.IsNullOrWhiteSpace(dto.ReferenceNumber))
        {
            return BadRequest(new { success = false, message = "Reference number is required." });
        }
        if (string.IsNullOrWhiteSpace(dto.Category))
        {
            return BadRequest(new { success = false, message = "Transaction category is required." });
        }
        if (string.IsNullOrWhiteSpace(dto.Payee))
        {
            return BadRequest(new { success = false, message = "Payee/recipient is required." });
        }
        var desc = !string.IsNullOrWhiteSpace(dto.Description) ? dto.Description : dto.Purpose;
        if (string.IsNullOrWhiteSpace(desc))
        {
            return BadRequest(new { success = false, message = "Purpose/description is required." });
        }

        var refNo = dto.ReferenceNumber.Trim();

        // 4. Validation: Unique reference number & duplicate prevention
        var existingOutflow = await _fomsDb.CashOutflows
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.SourceReference == refNo || o.CashOutflowId == refNo);

        var existingReq = await _fomsDb.CashOutflowApprovalRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TransactionReference == refNo || r.RequestGuid == refNo);

        if (existingOutflow != null || existingReq != null)
        {
            return Conflict(new { success = false, message = $"A cash outflow with reference number '{refNo}' already exists." });
        }

        // Active threshold check
        var threshold = await _fomsDb.ApprovalThresholdSettings
            .AsNoTracking()
            .Where(t => t.IsActive && (t.TransactionType == "CashOutflow" || t.TransactionType == "All"))
            .OrderByDescending(t => t.UpdatedAt)
            .FirstOrDefaultAsync();

        decimal maxLimit = threshold?.MaximumAmount ?? 10000.00m;
        bool exceedsThreshold = dto.Amount > maxLimit;

        var outflowId = $"CO-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpper()}";
        var txDate = dto.TransactionDate ?? DateTime.UtcNow;

        using var dbTx = await _fomsDb.Database.BeginTransactionAsync();
        try
        {
            // Initial database status: Pending Assistant Review
            const string initialStatus = "Pending Assistant Review";

            // 1. Save transaction in MSSQL
            var outflow = new CashOutflow
            {
                CashOutflowId = outflowId,
                SourceReference = refNo,
                Category = dto.Category.Trim(),
                Description = desc.Trim(),
                Payee = dto.Payee.Trim(),
                Amount = dto.Amount,
                Currency = string.IsNullOrWhiteSpace(dto.Currency) ? "PHP" : dto.Currency.Trim(),
                Status = initialStatus,
                RecordedBy = username,
                SubmittedBy = username,
                ApprovalLevel = "Level 1",
                AssignedApprover = "Assistant Financial Manager",
                SupportingDocuments = dto.SupportingDocuments,
                TransactionDate = txDate,
                OutflowDate = txDate,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _fomsDb.CashOutflows.Add(outflow);

            // 2. Create approval request
            var approvalReq = new CashOutflowApprovalRequest
            {
                RequestGuid = outflowId,
                CashOutflowId = outflowId,
                TransactionReference = refNo,
                Payee = dto.Payee.Trim(),
                Category = dto.Category.Trim(),
                Purpose = desc.Trim(),
                Amount = dto.Amount,
                Currency = string.IsNullOrWhiteSpace(dto.Currency) ? "PHP" : dto.Currency.Trim(),
                ApprovalLevel = "Level 1",
                AssignedRole = "Assistant Financial Manager",
                Status = initialStatus,
                IsEscalated = exceedsThreshold,
                EscalationThreshold = maxLimit,
                SubmittedBy = username,
                SubmittedById = employeeId,
                SubmittedAt = DateTime.UtcNow,
                SupportingDocuments = dto.SupportingDocuments,
                IsPosted = false,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _fomsDb.CashOutflowApprovalRequests.Add(approvalReq);
            await _fomsDb.SaveChangesAsync();

            // 3. Create approval history
            _fomsDb.CashOutflowApprovalHistories.Add(new CashOutflowApprovalHistory
            {
                ApprovalRequestId = approvalReq.ApprovalRequestId,
                ActorUserId = employeeId,
                ActorName = username,
                ActorRole = role,
                Action = "Submitted",
                PreviousStatus = "None",
                NewStatus = initialStatus,
                Remarks = exceedsThreshold
                    ? $"Submitted. Amount ₱{dto.Amount:N2} exceeds Assistant threshold ₱{maxLimit:N2} (Flagged for Level 2 review)."
                    : $"Submitted for Assistant review within limit (₱{maxLimit:N2}).",
                CreatedAt = DateTime.UtcNow
            });

            // 4. Create notification
            _fomsDb.Notifications.Add(new Notification
            {
                Type = "CASH_OUTFLOW_SUBMITTED",
                Title = "New Cash Outflow Awaiting Review",
                Message = $"Cash Outflow {refNo} for ₱{dto.Amount:N2} submitted by {username} ({initialStatus}).",
                RecipientRole = "Assistant Financial Manager",
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            });

            // 5. Create audit log
            _fomsDb.AuditLogs.Add(new AuditLog
            {
                user_id = userId,
                role = role,
                action = "RECORD_CASH_OUTFLOW",
                module = "Cash Outflows",
                affected_record_type = "CashOutflow",
                affected_record_id = approvalReq.ApprovalRequestId,
                before_value = "None",
                after_value = initialStatus,
                remarks = $"Recorded cash outflow {refNo} of ₱{dto.Amount:N2} to {dto.Payee}. Assigned to Assistant Financial Manager.",
                created_at = DateTime.UtcNow
            });

            await _fomsDb.SaveChangesAsync();
            await dbTx.CommitAsync();

            return StatusCode(201, new
            {
                success = true,
                message = "Cash outflow recorded successfully and queued for Assistant review.",
                data = new
                {
                    cashOutflowId = outflowId,
                    referenceNumber = refNo,
                    status = initialStatus,
                    amount = dto.Amount,
                    approvalLevel = "Level 1",
                    isEscalated = exceedsThreshold,
                    escalationThreshold = maxLimit,
                    assignedApprover = "Assistant Financial Manager",
                    submittedBy = username,
                    createdAt = outflow.CreatedAt
                }
            });
        }
        catch (Exception ex)
        {
            await dbTx.RollbackAsync();
            _logger.LogError(ex, "Failed to record cash outflow");
            return StatusCode(500, new { success = false, message = $"Failed to record cash outflow: {ex.Message}" });
        }
    }

    /// <summary>
    /// TC-010, TC-011, TC-012: List all cash outflows from MSSQL
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status, [FromQuery] string? category)
    {
        var query = _fomsDb.CashOutflows.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(o => o.Status == status);
        }
        if (!string.IsNullOrWhiteSpace(category) && !string.Equals(category, "ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(o => o.Category == category);
        }

        var list = await query.OrderByDescending(o => o.CreatedAt).ToListAsync();

        var records = list.Select(o => new
        {
            id = o.CashOutflowId ?? $"OUT-{o.OutflowId}",
            sourceReference = o.SourceReference ?? o.Description ?? $"Outflow {o.OutflowId}",
            referenceNumber = o.SourceReference ?? o.CashOutflowId,
            category = o.Category ?? "Disbursement",
            description = o.Description,
            payee = o.Payee,
            amount = o.Amount,
            currency = o.Currency ?? "PHP",
            status = o.Status ?? "Pending Assistant Review",
            date = (o.TransactionDate ?? o.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-dd"),
            recordedBy = o.RecordedBy ?? o.SubmittedBy ?? "System",
            createdAt = o.CreatedAt
        }).ToList();

        return Ok(new
        {
            success = true,
            count = records.Count,
            data = records
        });
    }

    /// <summary>
    /// Get single cash outflow by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var outflow = await _fomsDb.CashOutflows
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.CashOutflowId == id || o.SourceReference == id);

        if (outflow == null && int.TryParse(id, out var intId))
        {
            outflow = await _fomsDb.CashOutflows.AsNoTracking().FirstOrDefaultAsync(o => o.OutflowId == intId);
        }

        if (outflow == null)
        {
            return NotFound(new { success = false, message = $"Cash outflow '{id}' not found." });
        }

        return Ok(new
        {
            success = true,
            data = outflow
        });
    }

    /// <summary>
    /// TC-001, TC-005: Assistant queue - cash outflows pending Assistant review
    /// </summary>
    [HttpGet("assistant/pending")]
    public async Task<IActionResult> GetAssistantPending()
    {
        var pending = await _fomsDb.CashOutflowApprovalRequests
            .AsNoTracking()
            .Where(r => r.Status == "Pending Assistant Review" || r.Status == "Submitted")
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return Ok(new
        {
            success = true,
            count = pending.Count,
            data = pending
        });
    }

    /// <summary>
    /// POST /api/cash-outflows/{id}/assistant/approve
    /// </summary>
    [HttpPost("{id}/assistant/approve")]
    public async Task<IActionResult> AssistantApprove(string id)
    {
        var approvalsCtrl = new ApprovalsController(_fomsDb, HttpContext.RequestServices.GetRequiredService<ILogger<ApprovalsController>>())
        {
            ControllerContext = ControllerContext
        };
        return await approvalsCtrl.Approve(id);
    }

    /// <summary>
    /// POST /api/cash-outflows/{id}/assistant/reject
    /// </summary>
    [HttpPost("{id}/assistant/reject")]
    public async Task<IActionResult> AssistantReject(string id, [FromBody] System.Text.Json.JsonElement body)
    {
        var approvalsCtrl = new ApprovalsController(_fomsDb, HttpContext.RequestServices.GetRequiredService<ILogger<ApprovalsController>>())
        {
            ControllerContext = ControllerContext
        };
        return await approvalsCtrl.Reject(id, body);
    }

    /// <summary>
    /// POST /api/cash-outflows/{id}/assistant/return
    /// </summary>
    [HttpPost("{id}/assistant/return")]
    public async Task<IActionResult> AssistantReturn(string id, [FromBody] System.Text.Json.JsonElement body)
    {
        var approvalsCtrl = new ApprovalsController(_fomsDb, HttpContext.RequestServices.GetRequiredService<ILogger<ApprovalsController>>())
        {
            ControllerContext = ControllerContext
        };
        return await approvalsCtrl.ReturnForCorrection(id, body);
    }

    /// <summary>
    /// POST /api/cash-outflows/{id}/assistant/escalate
    /// </summary>
    [HttpPost("{id}/assistant/escalate")]
    public async Task<IActionResult> AssistantEscalate(string id, [FromBody] System.Text.Json.JsonElement? body)
    {
        var approvalsCtrl = new ApprovalsController(_fomsDb, HttpContext.RequestServices.GetRequiredService<ILogger<ApprovalsController>>())
        {
            ControllerContext = ControllerContext
        };
        return await approvalsCtrl.Escalate(id, body);
    }
}
