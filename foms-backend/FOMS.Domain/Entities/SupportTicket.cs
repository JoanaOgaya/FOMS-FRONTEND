using System;

namespace FOMS.Domain.Entities;

public class SupportTicket
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ClientName { get; set; } = string.Empty;
    public string TicketSubject { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = "Open"; // "Open", "In-Progress", "Resolved"
    public string DateCreated { get; set; } = string.Empty;
    public string LastUpdated { get; set; } = string.Empty;
}
