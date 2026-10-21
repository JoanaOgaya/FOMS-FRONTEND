using System;
using System.ComponentModel.DataAnnotations;

namespace FOMS.Application.Contracts;

/// <summary>
/// Payload transmitted to STARS when requesting client endorsement for a finalized invoice (Integration 1).
/// </summary>
public class FomsEndorsementRequestDto
{
    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    [Required]
    public string ClientName { get; set; } = string.Empty;

    public string? ClientAddress { get; set; }

    public string? ClientContactPerson { get; set; }

    public string? ClientContactNumber { get; set; }

    public string? ClientEmail { get; set; }

    [Required]
    public decimal InvoiceAmount { get; set; }

    public DateTime? BillingDate { get; set; }

    public DateTime? DueDate { get; set; }

    public string? InvoiceDocumentUrl { get; set; }

    public string? Remarks { get; set; }
}

/// <summary>
/// Acknowledgment response received from STARS after creating the endorsement task.
/// </summary>
public class StarsEndorsementResponseDto
{
    public bool IsSuccess { get; set; }
    public Guid StarsTaskId { get; set; }
    public string StarsTaskNumber { get; set; } = string.Empty;
    public string InvoiceNumber { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? AssignedTo { get; set; }
    public string Message { get; set; } = string.Empty;
}

/// <summary>
/// Inbound callback payload from STARS once the client signs receiving copy and task is approved (Integration 1).
/// </summary>
public class StarsEndorsementCompletionDto
{
    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    public Guid StarsTaskId { get; set; }

    public string? StarsTaskNumber { get; set; }

    public string CompletionResult { get; set; } = "Completed";

    [Required]
    public DateTime ActualReceivedDate { get; set; }

    public string? SignedCopyUrl { get; set; }

    public string? DeliveryRemarks { get; set; }

    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

    public string? CompletedBy { get; set; }
}

/// <summary>
/// Payload pushed from FOMS to STARS when invoice/payment status updates (Integration 2).
/// </summary>
public class FomsPaymentStatusDto
{
    [Required]
    public string ClientAccountId { get; set; } = string.Empty;

    public string ClientName { get; set; } = string.Empty;

    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    [Required]
    public string CurrentStatus { get; set; } = string.Empty;

    public decimal TotalAmount { get; set; }

    public decimal AmountPaid { get; set; }

    public decimal OutstandingBalance { get; set; }

    public DateTime? NextDueDate { get; set; }

    public DateTime? LastPaymentDate { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Payload pushed from FOMS to STARS when an invoice is overdue (Integration 3).
/// </summary>
public class FomsOverdueAlertDto
{
    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    [Required]
    public string ClientAccountId { get; set; } = string.Empty;

    [Required]
    public string ClientName { get; set; } = string.Empty;

    public string? ClientContactPerson { get; set; }

    public string? ClientContactNumber { get; set; }

    public string? ClientEmail { get; set; }

    public string? ClientAddress { get; set; }

    [Required]
    public decimal AmountDue { get; set; }

    public DateTime? DueDate { get; set; }

    public int DaysOverdue { get; set; }

    public string AgingStatus { get; set; } = "1-30";

    public DateTime AlertTimestamp { get; set; } = DateTime.UtcNow;

    public string? Remarks { get; set; }
}

/// <summary>
/// Payload to create or intercept a STARS Collection Follow-up task.
/// </summary>
public class StarsCollectionTaskRequestDto
{
    [Required]
    public string InvoiceNumber { get; set; } = string.Empty;

    public string? ClientName { get; set; }

    public decimal? AmountDue { get; set; }

    public int? DaysOverdue { get; set; }

    public string? PreferredCoordinatorId { get; set; }

    public string? Remarks { get; set; }
}

/// <summary>
/// Representation of a STARS Collection Follow-up task with assigned coordinator and routing metrics.
/// </summary>
public class StarsCollectionTaskDto
{
    public int TaskId { get; set; }
    public string TaskNumber { get; set; } = string.Empty;
    public string TaskType { get; set; } = "Collection Follow-up";
    public string InvoiceNumber { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public decimal AmountDue { get; set; }
    public int DaysOverdue { get; set; }
    public string? AssignedCoordinatorId { get; set; }
    public string AssignedCoordinatorName { get; set; } = string.Empty;
    public decimal RoutingScore { get; set; }
    public string? RoutingReason { get; set; }
    public string Status { get; set; } = "Assigned";
    public string? ActionTaken { get; set; }
    public string? Outcome { get; set; }
    public DateTime? PromisedPaymentDate { get; set; }
    public string? ExecutionNotes { get; set; }
    public DateTime? ExecutedAt { get; set; }
    public string? ExecutedBy { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// Payload when a Coordinator executes a collection follow-up inside STARS.
/// </summary>
public class StarsCollectionExecutionDto
{
    [Required]
    public string ActionTaken { get; set; } = string.Empty;

    [Required]
    public string Outcome { get; set; } = "Promised to Pay";

    public DateTime? PromisedPaymentDate { get; set; }

    public string? Notes { get; set; }

    public string? ExecutedBy { get; set; }
}

/// <summary>
/// Metric evaluated by the STARS Graph Routing Engine.
/// </summary>
public class StarsCoordinatorRoutingMetricDto
{
    public string CoordinatorId { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public int ActiveTasksCount { get; set; }
    public int OverdueTasksCount { get; set; }
    public int CompletedTasksCount { get; set; }
    public decimal WorkloadScore { get; set; }
    public decimal AvailabilityPercentage { get; set; }
    public bool IsOptimalCandidate { get; set; }
}
