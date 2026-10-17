using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace FOMS.Application.Contracts;

/// <summary>
/// Payload pushed from DMS to FOMS when a delivery is marked Completed after POD validation (Integration 1).
/// </summary>
public class DmsDeliveryCompletedDto
{
    [Required]
    public string WaybillNumber { get; set; } = string.Empty;

    public string DeliveryStatus { get; set; } = "Completed";

    public string? ClientName { get; set; }

    public string? ClientCode { get; set; }

    public string? RecipientName { get; set; }

    public string? RecipientAddress { get; set; }

    public string? RecipientContact { get; set; }

    public string? DeliveryArea { get; set; }

    public DateTime DeliveryDateTime { get; set; } = DateTime.UtcNow;

    [Required]
    public string PodImageUrl { get; set; } = string.Empty;

    public string? AssignedDriver { get; set; }

    public string? DriverEmployeeId { get; set; }

    public string? PackageDescription { get; set; }

    public int ItemCount { get; set; } = 1;

    public decimal ActualWeight { get; set; } = 1.0m;

    public decimal DeclaredValue { get; set; } = 0m;

    public string? DeliveryRemarks { get; set; }
}

/// <summary>
/// Payload pushed from DMS to FOMS when a delivery fails (Integration 2 - Trigger A).
/// </summary>
public class DmsDeliveryFailedDto
{
    [Required]
    public string WaybillNumber { get; set; } = string.Empty;

    public string FailedStatus { get; set; } = "Failed";

    [Required]
    public string FailureReason { get; set; } = string.Empty;

    public string? FailureRemarks { get; set; }

    public int AttemptCount { get; set; } = 1;

    public DateTime FailedAt { get; set; } = DateTime.UtcNow;

    public string? DriverEmployeeId { get; set; }
}

/// <summary>
/// Payload pushed from DMS to FOMS when redelivery succeeds (Integration 2 - Trigger B).
/// </summary>
public class DmsRedeliveryCompletedDto
{
    [Required]
    public string WaybillNumber { get; set; } = string.Empty;

    public string UpdatedStatus { get; set; } = "Completed";

    [Required]
    public string NewPodImageUrl { get; set; } = string.Empty;

    public int RedeliveryAttemptCount { get; set; } = 2;

    public string? RedeliveryReference { get; set; }

    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

    public string? RecipientName { get; set; }

    public string? DeliveryRemarks { get; set; }
}

/// <summary>
/// Payload pushed from DMS to FOMS when Operations creates a cash advance request (Integration 3 - Trigger A).
/// </summary>
public class DmsCashAdvanceRequestDto
{
    [Required]
    public string RequestId { get; set; } = string.Empty;

    public string? DeliveryReference { get; set; }

    [Required]
    public string RequesterName { get; set; } = string.Empty;

    public string? RequesterEmployeeId { get; set; }

    [Required]
    public string Purpose { get; set; } = string.Empty;

    [Range(0.01, 1000000.00)]
    public decimal RequestedAmount { get; set; }

    public DateTime RequestDate { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Line item receipt for liquidation.
/// </summary>
public class DmsLiquidationReceiptItemDto
{
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? ReceiptUrl { get; set; }
}

/// <summary>
/// Payload pushed from DMS to FOMS when Operations submits trip liquidation (Integration 3 - Trigger B).
/// </summary>
public class DmsLiquidationSubmissionDto
{
    [Required]
    public string RequestId { get; set; } = string.Empty;

    public int? FomsCashAdvanceId { get; set; }

    public string? DeliveryReference { get; set; }

    [Required]
    public string SubmittedByName { get; set; } = string.Empty;

    public decimal TotalAmount { get; set; }

    public decimal LeftoverCash { get; set; }

    public decimal ReimbursementAmount { get; set; }

    public List<DmsLiquidationReceiptItemDto>? Receipts { get; set; }

    public string? Notes { get; set; }

    public DateTime SubmissionDate { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Standard response from FOMS for DMS integration endpoints.
/// </summary>
public class DmsIntegrationResponseDto
{
    public bool IsSuccess { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? WaybillNumber { get; set; }
    public string? InvoiceNumber { get; set; }
    public decimal? ComputedAmount { get; set; }
    public bool? BillingHoldActive { get; set; }
    public int? CashAdvanceId { get; set; }
    public int? LiquidationId { get; set; }
    public string? Status { get; set; }
}
