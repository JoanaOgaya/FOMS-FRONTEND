using System;

namespace FOMS.Domain.Entities;

public class TransportationExpense
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PlateNumber { get; set; } = string.Empty;
    public string DriverName { get; set; } = string.Empty;
    public string ExpenseType { get; set; } = string.Empty; // "Fuel", "Toll", "Maintenance", "Allowance"
    public decimal Amount { get; set; }
    public string Date { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
