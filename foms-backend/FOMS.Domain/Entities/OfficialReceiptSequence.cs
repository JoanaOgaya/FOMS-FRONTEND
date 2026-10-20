using System;

namespace FOMS.Domain.Entities;

public class OfficialReceiptSequence
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public int LastYear { get; set; }
    public int LastOrNumber { get; set; }
}
