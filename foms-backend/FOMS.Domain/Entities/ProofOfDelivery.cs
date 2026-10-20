using System;
using FOMS.Domain.Entities.SqlServer;

namespace FOMS.Domain.Entities.SqlServer
{
    /// <summary>
    /// Represents a Proof of Delivery (POD) linked to a Waybill.
    /// </summary>
    public class ProofOfDelivery
    {
        public int Id { get; set; }
        public int WaybillId { get; set; }
        public DateTime DeliveredAt { get; set; } = DateTime.UtcNow;
        public string ReceiverName { get; set; } = string.Empty;
        public string? SignatureImageUrl { get; set; }
        // Navigation property
        public Waybill? Waybill { get; set; }
    }
}
