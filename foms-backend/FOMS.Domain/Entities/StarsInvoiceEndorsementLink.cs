using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FOMS.Domain.Entities;

[Table("StarsInvoiceEndorsementLinks")]
public class StarsInvoiceEndorsementLink
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string InvoiceNumber { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? StarsTaskId { get; set; }

    [MaxLength(50)]
    public string? StarsTaskNumber { get; set; }

    /// <summary>
    /// Status: EndorsementRequested, Received, Completed
    /// </summary>
    [MaxLength(50)]
    public string Status { get; set; } = "EndorsementRequested";

    public DateTime? ActualReceivedDate { get; set; }

    [MaxLength(1000)]
    public string? SignedCopyUrl { get; set; }

    [MaxLength(1000)]
    public string? DeliveryRemarks { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
