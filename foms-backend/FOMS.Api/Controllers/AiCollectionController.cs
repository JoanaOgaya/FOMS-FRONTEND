using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[AllowAnonymous]
[ApiController]
public class AiCollectionController : ApiControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public class RecommendationModel
    {
        public string id { get; set; } = string.Empty;
        public string review_status { get; set; } = "Pending Review";
        public string? reviewed_at { get; set; }
        public string? reviewed_by { get; set; }
        public string? reviewer_role { get; set; }
        public string? remarks { get; set; }
        public string? recommended_action { get; set; }
        public string? request_type { get; set; }

        // Two-way communication between Accountant and Finance Manager
        public string? accountant_notes { get; set; }
        public string? accountant_request_type { get; set; }
        public string? accountant_name { get; set; }
        public string? accountant_date { get; set; }

        public string? manager_decision { get; set; }
        public string? manager_action_taken { get; set; }
        public string? manager_remarks { get; set; }
        public string? manager_name { get; set; }
        public string? manager_date { get; set; }

        public PriorityModel? priority { get; set; }
    }

    public class PriorityModel
    {
        public string id { get; set; } = string.Empty;
        public string normalized_invoice_number { get; set; } = string.Empty;
        public string invoice_number { get; set; } = string.Empty;
        public string client_name { get; set; } = string.Empty;
        public decimal outstanding_balance { get; set; }
        public string priority_level { get; set; } = "Normal Priority";
        public int priority_score { get; set; } = 50;
        public int overdue_days { get; set; } = 0;
        public string due_date { get; set; } = string.Empty;
        public string suggested_action { get; set; } = string.Empty;
    }

    private static readonly object _lock = new object();
    private static readonly List<RecommendationModel> _recommendations = new List<RecommendationModel>
    {
        new RecommendationModel
        {
            id = "REC-001",
            review_status = "Accepted Recommendation",
            reviewed_at = DateTime.UtcNow.AddHours(-2).ToString("o"),
            reviewed_by = "Accountant User",
            reviewer_role = "Accountant",
            remarks = "Recommended priority follow-up call with client finance team.",
            recommended_action = "Payment overdue by 24 days. Priority rank #1. Auto follow-up email suggested.",
            accountant_request_type = "Request Approval for Payment Demand Letter",
            accountant_notes = "Account is 14 days overdue. Client requested payment plan, seeking FM decision.",
            accountant_name = "Accountant User",
            accountant_date = DateTime.UtcNow.AddHours(-2).ToString("o"),
            manager_decision = "Proceed with Legal Escalation",
            manager_action_taken = "Approved issuance of formal payment demand letter.",
            manager_remarks = "Coordinate with Treasury and Legal for official dispatch.",
            manager_name = "Finance Manager",
            manager_date = DateTime.UtcNow.AddHours(-1).ToString("o"),
            priority = new PriorityModel
            {
                id = "PRIO-001",
                normalized_invoice_number = "LZD-2026-0001",
                invoice_number = "LZD-2026-0001",
                client_name = "Lazada Philippines",
                outstanding_balance = 50000.00m,
                priority_level = "High Priority",
                priority_score = 88,
                overdue_days = 14,
                due_date = DateTime.UtcNow.AddDays(15).ToString("yyyy-MM-dd"),
                suggested_action = "Send official payment demand letter and coordinate with treasury."
            }
        },
        new RecommendationModel
        {
            id = "REC-002",
            review_status = "Accepted Recommendation",
            reviewed_at = DateTime.UtcNow.AddHours(-5).ToString("o"),
            reviewed_by = "Accountant User",
            reviewer_role = "Accountant",
            remarks = "Client agreed to settle within the week.",
            recommended_action = "Routine semi-monthly settlement review.",
            accountant_request_type = "Log Client Follow-up (Routine Call/Email)",
            accountant_notes = "Spoke with client finance team. Promised check release on Friday.",
            accountant_name = "Accountant User",
            accountant_date = DateTime.UtcNow.AddHours(-5).ToString("o"),
            priority = new PriorityModel
            {
                id = "PRIO-002",
                normalized_invoice_number = "BI-2026-0001",
                invoice_number = "BI-2026-0001",
                client_name = "Lazada Philippines",
                outstanding_balance = 30000.00m,
                priority_level = "Medium Priority",
                priority_score = 65,
                overdue_days = 5,
                due_date = DateTime.UtcNow.AddDays(20).ToString("yyyy-MM-dd"),
                suggested_action = "Follow up via email regarding overdue billing."
            }
        },
        new RecommendationModel
        {
            id = "REC-003",
            review_status = "Accepted Recommendation",
            reviewed_at = DateTime.UtcNow.AddHours(-12).ToString("o"),
            reviewed_by = "Accountant User",
            reviewer_role = "Accountant",
            remarks = "Low risk client with consistent weekly payment record.",
            recommended_action = "Routine courtesy notification sent.",
            priority = new PriorityModel
            {
                id = "PRIO-003",
                normalized_invoice_number = "SHP-2026-0001",
                invoice_number = "SHP-2026-0001",
                client_name = "Shopee Philippines",
                outstanding_balance = 12500.00m,
                priority_level = "Low Priority",
                priority_score = 25,
                overdue_days = 0,
                due_date = DateTime.UtcNow.AddDays(30).ToString("yyyy-MM-dd"),
                suggested_action = "Routine payment tracking scheduled for standard billing cycle."
            }
        }
    };

    public AiCollectionController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    [HttpGet("api/ai/collection/recommendations")]
    [HttpGet("ai/collection/recommendations")]
    public IActionResult GetRecommendations([FromQuery] string? status)
    {
        lock (_lock)
        {
            return Ok(_recommendations.ToList());
        }
    }

    [HttpPost("api/ai/collection/recommendations/{id}/review")]
    [HttpPost("ai/collection/recommendations/{id}/review")]
    [HttpPost("api/ai/collection/recommendations/{id}/escalate")]
    [HttpPost("ai/collection/recommendations/{id}/escalate")]
    public IActionResult ReviewRecommendation(string id, [FromBody] JsonElement body)
    {
        return SaveDecisionOrEscalation(id, body);
    }

    [HttpPost("api/ai/collection/recommendations/escalate")]
    [HttpPost("ai/collection/recommendations/escalate")]
    [HttpPost("api/ai/collection/recommendations/new")]
    [HttpPost("ai/collection/recommendations/new")]
    [HttpPost("api/ai/collection/recommendations")]
    [HttpPost("ai/collection/recommendations")]
    public IActionResult EscalateGeneral([FromBody] JsonElement body)
    {
        string? targetId = null;
        if (body.TryGetProperty("rec_id", out var recProp)) targetId = recProp.GetString();
        if (string.IsNullOrEmpty(targetId) && body.TryGetProperty("id", out var idProp)) targetId = idProp.GetString();
        if (string.IsNullOrEmpty(targetId) && body.TryGetProperty("priority_id", out var prioProp)) targetId = prioProp.GetString();

        return SaveDecisionOrEscalation(targetId ?? "REC-NEW", body);
    }

    private IActionResult SaveDecisionOrEscalation(string id, JsonElement body)
    {
        lock (_lock)
        {
            string? decision = null;
            if (body.TryGetProperty("decision", out var dProp)) decision = dProp.GetString();

            string? remarks = null;
            if (body.TryGetProperty("remarks", out var rProp)) remarks = rProp.GetString();

            string? requestType = null;
            if (body.TryGetProperty("request_type", out var rtProp)) requestType = rtProp.GetString();

            string? priorityId = null;
            if (body.TryGetProperty("priority_id", out var pProp)) priorityId = pProp.GetString();

            string? recommendedAction = null;
            if (body.TryGetProperty("recommendedAction", out var raProp)) recommendedAction = raProp.GetString();

            string? escalatedBy = null;
            if (body.TryGetProperty("escalated_by", out var ebProp)) escalatedBy = ebProp.GetString();

            string? actionTaken = null;
            if (body.TryGetProperty("actionTaken", out var atProp)) actionTaken = atProp.GetString();

            string? managerRemarks = null;
            if (body.TryGetProperty("managerRemarks", out var mrProp)) managerRemarks = mrProp.GetString();

            var existing = _recommendations.FirstOrDefault(r => 
                r.id.Equals(id, StringComparison.OrdinalIgnoreCase) || 
                (r.priority != null && r.priority.id.Equals(id, StringComparison.OrdinalIgnoreCase)) ||
                (!string.IsNullOrEmpty(priorityId) && r.priority != null && r.priority.id.Equals(priorityId, StringComparison.OrdinalIgnoreCase))
            );

            bool isManagerAction = decision != null && (
                decision.Contains("Accept & Close", StringComparison.OrdinalIgnoreCase) ||
                decision.Contains("Legal Escalation", StringComparison.OrdinalIgnoreCase) ||
                decision.Contains("Reject Priority Assignment", StringComparison.OrdinalIgnoreCase) ||
                decision.Contains("Reviewed & Closed", StringComparison.OrdinalIgnoreCase) ||
                !string.IsNullOrEmpty(actionTaken)
            );

            if (existing != null)
            {
                if (isManagerAction)
                {
                    existing.manager_decision = decision ?? "Accept & Close";
                    existing.manager_action_taken = actionTaken ?? remarks ?? "Manager reviewed and recorded decision.";
                    existing.manager_remarks = managerRemarks ?? recommendedAction ?? remarks ?? string.Empty;
                    existing.manager_name = "Finance Manager";
                    existing.manager_date = DateTime.UtcNow.ToString("o");
                    existing.review_status = decision ?? "Reviewed & Closed";
                    existing.reviewed_at = DateTime.UtcNow.ToString("o");
                    existing.reviewed_by = "Finance Manager";
                    existing.reviewer_role = "Finance Manager";
                }
                else
                {
                    existing.accountant_request_type = requestType ?? existing.accountant_request_type;
                    existing.accountant_notes = remarks ?? existing.accountant_notes;
                    existing.accountant_name = escalatedBy ?? existing.accountant_name ?? "Accountant User";
                    existing.accountant_date = DateTime.UtcNow.ToString("o");
                    existing.request_type = requestType ?? existing.request_type;
                    existing.remarks = remarks ?? existing.remarks;
                    existing.review_status = decision ?? "Escalated to Finance Manager";
                    existing.reviewed_at = DateTime.UtcNow.ToString("o");
                    existing.reviewed_by = escalatedBy ?? existing.reviewed_by ?? "Accountant User";
                    existing.reviewer_role = "Accountant";
                    if (!string.IsNullOrEmpty(recommendedAction)) existing.recommended_action = recommendedAction;
                }
            }
            else
            {
                var newRec = new RecommendationModel
                {
                    id = string.IsNullOrEmpty(id) || id == "REC-NEW" ? $"REC-{Guid.NewGuid().ToString().Substring(0, 8).ToUpper()}" : id,
                    review_status = decision ?? "Escalated to Finance Manager",
                    reviewed_at = DateTime.UtcNow.ToString("o"),
                    reviewed_by = escalatedBy ?? "Accountant User",
                    reviewer_role = isManagerAction ? "Finance Manager" : "Accountant",
                    remarks = remarks ?? "Escalated to Finance Manager for review and decision.",
                    recommended_action = recommendedAction ?? requestType ?? "Escalated priority account",
                    request_type = requestType,
                    accountant_request_type = requestType,
                    accountant_notes = remarks,
                    accountant_name = escalatedBy ?? "Accountant User",
                    accountant_date = DateTime.UtcNow.ToString("o"),
                    manager_decision = isManagerAction ? decision : null,
                    manager_action_taken = isManagerAction ? actionTaken : null,
                    manager_remarks = isManagerAction ? managerRemarks : null,
                    manager_name = isManagerAction ? "Finance Manager" : null,
                    manager_date = isManagerAction ? DateTime.UtcNow.ToString("o") : null,
                    priority = new PriorityModel
                    {
                        id = priorityId ?? "PRIO-NEW",
                        normalized_invoice_number = "INV-ESC",
                        invoice_number = "INV-ESC",
                        client_name = "Client Account",
                        outstanding_balance = 0,
                        priority_level = "High Priority",
                        due_date = DateTime.UtcNow.AddDays(7).ToString("yyyy-MM-dd")
                    }
                };
                _recommendations.Add(newRec);
            }

            return Ok(new { success = true, message = "Saved successfully." });
        }
    }

    [HttpGet("api/ai/collection/priorities")]
    [HttpGet("ai/collection/priorities")]
    public IActionResult GetPriorities()
    {
        lock (_lock)
        {
            var priorities = _recommendations.Select(r => new
            {
                id = r.priority?.id ?? r.id,
                invoiceNumber = r.priority?.invoice_number ?? "N/A",
                invoice_number = r.priority?.invoice_number ?? "N/A",
                clientName = r.priority?.client_name ?? "Unknown",
                client_name = r.priority?.client_name ?? "Unknown",
                outstandingBalance = r.priority?.outstanding_balance ?? 0,
                outstanding_balance = r.priority?.outstanding_balance ?? 0,
                dueDate = r.priority?.due_date ?? "",
                due_date = r.priority?.due_date ?? "",
                priorityLevel = r.priority?.priority_level ?? "Normal Priority",
                priority_level = r.priority?.priority_level ?? "Normal Priority",
                priorityScore = r.priority?.priority_score ?? 50,
                priority_score = r.priority?.priority_score ?? 50,
                daysOverdue = r.priority?.overdue_days ?? 0,
                overdue_days = r.priority?.overdue_days ?? 0,
                suggestedAction = r.priority?.suggested_action ?? r.recommended_action ?? "",
                suggested_action = r.priority?.suggested_action ?? r.recommended_action ?? "",
                rec_id = r.id,
                review_status = r.review_status,
                request_type = r.request_type ?? r.accountant_request_type,
                remarks = r.remarks,
                reviewed_by = r.reviewed_by,
                reviewed_at = r.reviewed_at,

                accountant_notes = r.accountant_notes,
                accountant_request_type = r.accountant_request_type,
                accountant_name = r.accountant_name,
                accountant_date = r.accountant_date,

                manager_decision = r.manager_decision,
                manager_action_taken = r.manager_action_taken,
                manager_remarks = r.manager_remarks,
                manager_name = r.manager_name,
                manager_date = r.manager_date
            }).ToList();

            return Ok(priorities);
        }
    }

    [HttpGet("api/ai/dashboard/alerts")]
    [HttpGet("ai/dashboard/alerts")]
    public IActionResult GetDashboardAlerts([FromQuery] string? scope)
    {
        var alerts = new List<object>
        {
            new
            {
                id = "ALT-001",
                title = "High Priority Collection Alert",
                message = "Invoice LZD-2026-0001 (₱50,000.00) requires immediate collection follow-up.",
                severity = "warning",
                module = "collection",
                createdAt = DateTime.UtcNow.AddHours(-1).ToString("o")
            },
            new
            {
                id = "ALT-002",
                title = "Settlement Validation Ready",
                message = "2 courier settlements awaiting Financial Manager verification.",
                severity = "info",
                module = "settlements",
                createdAt = DateTime.UtcNow.AddHours(-3).ToString("o")
            }
        };

        return Ok(alerts);
    }
}
