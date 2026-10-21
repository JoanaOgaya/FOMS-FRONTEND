using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Domain.Entities.SqlServer;
using FOMS.Infrastructure.Persistence;

namespace FOMS.Api.Controllers;

[ApiController]
[Route("api/ai/outputs")]
[Route("api/ai-outputs")]
[Route("ai/outputs")]
[Route("ai-outputs")]
public class AiOutputsController : ApiControllerBase
{
    private readonly FomsDbContext _fomsDb;

    public AiOutputsController(FomsDbContext fomsDb)
    {
        _fomsDb = fomsDb;
    }

    [HttpGet]
    public async Task<IActionResult> GetOutputs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        [FromQuery] string? module = null,
        [FromQuery] string? dateFrom = null,
        [FromQuery] string? scope = null)
    {
        try
        {
            var query = _fomsDb.AIOutputHistories.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                query = query.Where(o =>
                    (o.SourceReference != null && o.SourceReference.ToLower().Contains(s)) ||
                    (o.OutputType != null && o.OutputType.ToLower().Contains(s)) ||
                    (o.Message != null && o.Message.ToLower().Contains(s)));
            }

            if (!string.IsNullOrWhiteSpace(module))
            {
                var m = module.Trim().ToLower();
                if (m.Contains("dup"))
                    query = query.Where(o => o.OutputType != null && o.OutputType.ToLower().Contains("dup"));
                else if (m.Contains("risk"))
                    query = query.Where(o => o.OutputType != null && o.OutputType.ToLower().Contains("risk"));
                else if (m.Contains("coll"))
                    query = query.Where(o => o.OutputType != null && o.OutputType.ToLower().Contains("coll"));
                else if (m.Contains("doc"))
                    query = query.Where(o => o.OutputType != null && (o.OutputType.ToLower().Contains("doc") || o.OutputType.ToLower().Contains("extract")));
            }

            if (!string.IsNullOrWhiteSpace(dateFrom) && DateTime.TryParse(dateFrom, out var df))
            {
                query = query.Where(o => o.CreatedAt >= df);
            }

            if (!string.IsNullOrWhiteSpace(scope))
            {
                if (scope.Equals("liquidation", StringComparison.OrdinalIgnoreCase))
                {
                    query = query.Where(o =>
                        (o.OutputType != null && o.OutputType.ToLower().Contains("liquid")) ||
                        (o.SourceReference != null && (o.SourceReference.StartsWith("LIQ") || o.SourceReference.StartsWith("SCAN-AFM"))) ||
                        (o.Message != null && (o.Message.ToLower().Contains("liquidation") || o.Message.ToLower().Contains("assistant fm"))));
                }
                else if (scope.Equals("own", StringComparison.OrdinalIgnoreCase))
                {
                    query = query.Where(o =>
                        (o.SourceReference != null && (o.SourceReference.StartsWith("INV") || o.SourceReference.StartsWith("OR") || o.SourceReference.StartsWith("SPEEDPAY"))));
                }
            }

            var total = await query.CountAsync();
            var history = await query
                .OrderByDescending(o => o.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            Dictionary<int, string> clients = new();
            try
            {
                clients = await _fomsDb.Clients.AsNoTracking().ToDictionaryAsync(c => c.ClientId, c => c.CompanyName ?? $"Client {c.ClientId}");
            }
            catch { }

            List<Invoice> invoices = new();
            try
            {
                invoices = await _fomsDb.Invoices.AsNoTracking().ToListAsync();
            }
            catch { }

            List<Liquidation> liquidations = new();
            try
            {
                liquidations = await _fomsDb.Liquidations.AsNoTracking().Where(l => l.IsDeleted != true).ToListAsync();
            }
            catch { }

            var items = history.Select(h =>
            {
                var mod = (h.OutputType?.ToLower().Contains("dup") == true) ? "duplicate" :
                          (h.OutputType?.ToLower().Contains("risk") == true) ? "risk" :
                          (h.OutputType?.ToLower().Contains("coll") == true) ? "collection" : "document";

                // Parse score from message
                int score = 98;
                var pctMatch = System.Text.RegularExpressions.Regex.Match(h.Message ?? "", @"(\d+(?:\.\d+)?)%");
                var fracMatch = System.Text.RegularExpressions.Regex.Match(h.Message ?? "", @"(\d+)/100");
                if (pctMatch.Success && double.TryParse(pctMatch.Groups[1].Value, out var pv))
                    score = (int)Math.Round(pv);
                else if (fracMatch.Success && int.TryParse(fracMatch.Groups[1].Value, out var fv))
                    score = fv;
                else
                    score = mod == "risk" ? 18 : mod == "duplicate" ? 96 : mod == "collection" ? 85 : 98;

                var level = mod == "risk" ? "LOW" :
                            mod == "collection" ? "HIGH" : "NORMAL";

                var decision = h.ProcessingStatus?.Contains("FLAG") == true ? "FLAGGED" :
                               h.ProcessingStatus?.Contains("UNIQUE") == true ? "UNIQUE" : "VERIFIED";

                // Resolve client / entity name dynamically
                string clientName = "Taragis Logistics";
                string reviewer = "Financial Manager";
                string reviewerRole = "FINANCIAL_MANAGER";

                var src = h.SourceReference ?? string.Empty;
                if (src.Contains("(") && src.Contains(")"))
                {
                    var start = src.IndexOf('(');
                    var end = src.IndexOf(')');
                    if (end > start)
                        clientName = src.Substring(start + 1, end - start - 1);
                }
                else if (src.StartsWith("LIQ", StringComparison.OrdinalIgnoreCase) || src.StartsWith("SCAN-AFM", StringComparison.OrdinalIgnoreCase) || h.Message?.ToLower().Contains("liquidation") == true)
                {
                    var matchedLiq = liquidations.FirstOrDefault(l =>
                        (!string.IsNullOrEmpty(l.ReferenceNumber) && src.Contains(l.ReferenceNumber, StringComparison.OrdinalIgnoreCase)) ||
                        (l.LiquidationId > 0 && src.Contains(l.LiquidationId.ToString())));
                    clientName = matchedLiq?.SubmittedByName ?? "Courier Operations";
                    reviewer = "Assistant Financial Manager";
                    reviewerRole = "ASSISTANT_FM";
                }
                else if (src.StartsWith("INV", StringComparison.OrdinalIgnoreCase))
                {
                    var matchedInv = invoices.FirstOrDefault(i =>
                        !string.IsNullOrEmpty(i.InvoiceNumber) && src.Contains(i.InvoiceNumber, StringComparison.OrdinalIgnoreCase));
                    if (matchedInv != null && matchedInv.ClientId.HasValue && clients.TryGetValue(matchedInv.ClientId.Value, out var resolvedClient))
                        clientName = resolvedClient;
                    else
                        clientName = "Billing Operations";
                }
                else if (src.StartsWith("SPEEDPAY", StringComparison.OrdinalIgnoreCase))
                {
                    clientName = "SpeedPay Merchant Collections";
                }
                else if (src.StartsWith("WB", StringComparison.OrdinalIgnoreCase))
                {
                    clientName = "Courier Logistics Operations";
                }

                return new
                {
                    id = $"AI-OUT-{h.OutputId:D4}",
                    outputId = h.OutputId,
                    module = mod,
                    entityType = h.OutputType ?? "Document",
                    entityId = h.SourceReference ?? $"DOC-{h.OutputId}",
                    documentNumber = h.SourceReference ?? $"DOC-{h.OutputId:D4}",
                    clientName,
                    outputSummary = h.Message ?? $"{h.OutputType} processed successfully by {h.ModelName}",
                    score = score,
                    level = level,
                    reviewer,
                    reviewerRole,
                    reviewDecision = decision,
                    remarks = h.Message,
                    createdAt = (h.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
                    linkUrl = (h.SourceReference?.ToUpperInvariant().StartsWith("INV") == true) ? "/invoicing-desk" :
                              (h.SourceReference?.ToUpperInvariant().StartsWith("WB") == true) ? "/waybills" :
                              (h.SourceReference?.ToUpperInvariant().StartsWith("PAY") == true || h.SourceReference?.ToUpperInvariant().StartsWith("SPP") == true) ? "/payments" :
                              (mod == "duplicate") ? "/flagged-duplicates" : "/liquidations",
                    createdBy = "System AI",
                    outputType = h.OutputType ?? "Extraction",
                    sourceReference = h.SourceReference ?? $"DOC-{h.OutputId}",
                    processingStatus = h.ProcessingStatus ?? "Completed",
                    modelName = h.ModelName ?? "Gemini Pro",
                    version = h.Version ?? "1.0",
                    message = h.Message ?? "Processed successfully"
                };
            }).ToList();

            return Ok(new
            {
                items,
                total,
                page,
                pageSize
            });
        }
        catch (Exception ex)
        {
            return Ok(new
            {
                items = new List<object>(),
                total = 0,
                page,
                pageSize,
                error = ex.Message
            });
        }
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        int numId = 0;
        if (id.StartsWith("AI-OUT-", StringComparison.OrdinalIgnoreCase))
            int.TryParse(id.Substring(7), out numId);
        else
            int.TryParse(id, out numId);

        var item = await _fomsDb.AIOutputHistories.FindAsync(numId);
        if (item == null)
            return NotFound(new { message = $"AI output record {id} not found." });

        string clientName = "Taragis Logistics";
        string reviewer = "Financial Manager";
        var src = item.SourceReference ?? string.Empty;
        if (src.Contains("(") && src.Contains(")"))
        {
            var start = src.IndexOf('(');
            var end = src.IndexOf(')');
            if (end > start)
                clientName = src.Substring(start + 1, end - start - 1);
        }
        else if (src.StartsWith("LIQ", StringComparison.OrdinalIgnoreCase) || src.StartsWith("SCAN-AFM", StringComparison.OrdinalIgnoreCase) || item.Message?.ToLower().Contains("liquidation") == true)
        {
            var matchedLiq = await _fomsDb.Liquidations.AsNoTracking().FirstOrDefaultAsync(l => l.IsDeleted != true &&
                !string.IsNullOrEmpty(l.ReferenceNumber) && src.Contains(l.ReferenceNumber));
            clientName = matchedLiq?.SubmittedByName ?? "Courier Operations";
            reviewer = "Assistant Financial Manager";
        }

        var pctMatch = System.Text.RegularExpressions.Regex.Match(item.Message ?? "", @"(\d+(?:\.\d+)?)%");
        int score = pctMatch.Success && double.TryParse(pctMatch.Groups[1].Value, out var pv) ? (int)Math.Round(pv) : 98;

        return Ok(new
        {
            id = $"AI-OUT-{item.OutputId:D4}",
            outputId = item.OutputId,
            module = item.OutputType?.ToLower().Contains("dup") == true ? "duplicate" : "document",
            entityType = item.OutputType ?? "Document",
            entityId = item.SourceReference ?? $"DOC-{item.OutputId}",
            documentNumber = item.SourceReference ?? $"DOC-{item.OutputId:D4}",
            clientName,
            outputSummary = item.Message,
            score,
            level = "LOW",
            reviewer,
            reviewDecision = item.ProcessingStatus?.Contains("FLAG") == true ? "FLAGGED" : "VERIFIED",
            createdAt = (item.CreatedAt ?? DateTime.UtcNow).ToString("yyyy-MM-ddTHH:mm:ss"),
            linkUrl = (item.SourceReference?.ToUpperInvariant().StartsWith("INV") == true) ? "/invoicing-desk" :
                      (item.SourceReference?.ToUpperInvariant().StartsWith("WB") == true) ? "/waybills" :
                      (item.SourceReference?.ToUpperInvariant().StartsWith("PAY") == true || item.SourceReference?.ToUpperInvariant().StartsWith("SPP") == true) ? "/payments" :
                      (item.OutputType?.ToLower().Contains("dup") == true) ? "/flagged-duplicates" : "/liquidations"
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AIOutputHistory item)
    {
        item.CreatedAt = DateTime.UtcNow;
        _fomsDb.AIOutputHistories.Add(item);
        await _fomsDb.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = item.OutputId.ToString() }, item);
    }
}
