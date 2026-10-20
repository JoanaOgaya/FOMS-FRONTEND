using System;

namespace FOMS.Domain.Entities;

public class PayrollDeductionLine
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PayrollRecordId { get; set; } = string.Empty;
    public PayrollRecord? PayrollRecord { get; set; }
    
    // e.g. "SSS", "PhilHealth", "Pag-IBIG", "Withholding Tax"
    public string DeductionType { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}
