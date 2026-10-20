using System;

namespace FOMS.Domain.Entities;

public class PaymentAdjustment
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string InvoiceNo { get; set; } = string.Empty;

    /// <summary>Adjustment type: "Credit", "Debit", or "Write-Off".</summary>
    public string AdjustmentType { get; set; } = string.Empty;

    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;

    /// <summary>The Bookkeeper who submitted this adjustment request.</summary>
    public string AdjustedBy { get; set; } = string.Empty;

    /// <summary>The Accountant who approved or rejected this adjustment.</summary>
    public string ApprovedBy { get; set; } = string.Empty;

    /// <summary>ISO date when this adjustment was submitted (yyyy-MM-dd).</summary>
    public string DateRequested { get; set; } = DateTime.UtcNow.ToString("yyyy-MM-dd");

    /// <summary>ISO date when this adjustment was approved or rejected (yyyy-MM-dd). Empty while Pending.</summary>
    public string DateApproved { get; set; } = string.Empty;

    /// <summary>Workflow status: "Pending", "Approved", or "Rejected".</summary>
    public string Status { get; set; } = "Pending";
}
