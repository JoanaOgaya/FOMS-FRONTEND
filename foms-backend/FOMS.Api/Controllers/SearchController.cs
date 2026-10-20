using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.DTOs;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;

namespace FOMS.Api.Controllers;

[Authorize]
[Route("api/search")]
[Route("api/v1/search")]
[ApiController]
public class SearchController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public SearchController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpPost("query")]
    public async Task<IActionResult> AdvancedSearch([FromBody] AdvancedFilterRequest request)
    {
        // 1. Date Validation Rules
        if (request.StartDate.HasValue && request.EndDate.HasValue)
        {
            if (request.StartDate.Value > request.EndDate.Value)
            {
                return BadRequest(new { message = "Validation Error: Start Date cannot be greater than End Date." });
            }
        }

        DateTime now = DateTime.UtcNow;
        if (request.StartDate.HasValue && request.StartDate.Value > now.AddDays(1))
        {
            return BadRequest(new { message = "Validation Error: Future dates cannot be selected." });
        }
        if (request.EndDate.HasValue && request.EndDate.Value > now.AddDays(1))
        {
            return BadRequest(new { message = "Validation Error: Future dates cannot be selected." });
        }

        // Determine date range filters
        DateTime? filterStart = request.StartDate;
        DateTime? filterEnd = request.EndDate;

        if (!string.IsNullOrEmpty(request.DateFilterType))
        {
            DateTime today = DateTime.Today;
            switch (request.DateFilterType.ToLower())
            {
                case "today":
                    filterStart = today;
                    filterEnd = today.AddDays(1).AddSeconds(-1);
                    break;
                case "yesterday":
                    filterStart = today.AddDays(-1);
                    filterEnd = today.AddSeconds(-1);
                    break;
                case "last7days":
                    filterStart = today.AddDays(-7);
                    filterEnd = today.AddDays(1).AddSeconds(-1);
                    break;
                case "last30days":
                    filterStart = today.AddDays(-30);
                    filterEnd = today.AddDays(1).AddSeconds(-1);
                    break;
                case "thismonth":
                    filterStart = new DateTime(today.Year, today.Month, 1);
                    filterEnd = today.AddDays(1).AddSeconds(-1);
                    break;
                case "lastmonth":
                    var lm = today.AddMonths(-1);
                    filterStart = new DateTime(lm.Year, lm.Month, 1);
                    filterEnd = new DateTime(today.Year, today.Month, 1).AddSeconds(-1);
                    break;
                case "quarterly":
                    int quarter = (today.Month - 1) / 3;
                    filterStart = new DateTime(today.Year, (quarter * 3) + 1, 1);
                    filterEnd = today.AddDays(1).AddSeconds(-1);
                    break;
                case "yearly":
                    filterStart = new DateTime(today.Year, 1, 1);
                    filterEnd = today.AddDays(1).AddSeconds(-1);
                    break;
            }
        }

        // Fetch datasets to perform search and ranking
        var clients = await _context.Clients.AsNoTracking().ToListAsync();
        var invoices = await _context.Invoices.AsNoTracking().ToListAsync();
        var payments = await _context.Payments.AsNoTracking().ToListAsync();
        var cashflow = await _context.CashFlowTransactions.AsNoTracking().ToListAsync();
        var auditLogs = await _context.AuditLogs.AsNoTracking().ToListAsync();

        var results = new List<SmartSearchResult>();
        string query = request.SearchQuery?.Trim().ToLower() ?? string.Empty;

        // â”€â”€â”€ 1. Filter and Rank Invoices â”€â”€â”€
        foreach (var inv in invoices)
        {
            // Date Filter Check
            if (DateTime.TryParse(inv.BillingDate, out var bDate))
            {
                if (filterStart.HasValue && bDate < filterStart.Value) continue;
                if (filterEnd.HasValue && bDate > filterEnd.Value) continue;
            }

            // Payment Status Multi-select check
            if (request.PaymentStatuses != null && request.PaymentStatuses.Any())
            {
                if (!request.PaymentStatuses.Contains(inv.PaymentStatus, StringComparer.OrdinalIgnoreCase))
                {
                    // If filtering by "Overdue" but invoice is Unpaid with DaysOverdue > 0
                    if (request.PaymentStatuses.Contains("Overdue", StringComparer.OrdinalIgnoreCase) && inv.DaysOverdue > 0)
                    {
                        // Match allowed
                    }
                    else
                    {
                        continue;
                    }
                }
            }

            // Client check
            if (!string.IsNullOrEmpty(request.ClientId) && inv.ClientId != request.ClientId)
                continue;

            // Amount limits check
            if (request.MinAmount.HasValue && inv.TotalAmount < request.MinAmount.Value) continue;
            if (request.MaxAmount.HasValue && inv.TotalAmount > request.MaxAmount.Value) continue;

            double score = 0;
            if (string.IsNullOrEmpty(query))
            {
                score = 0.5; // base score if no search text
            }
            else
            {
                if (inv.InvoiceNo.ToLower() == query) score = 1.0;
                else if (inv.InvoiceNo.ToLower().Contains(query)) score = 0.8;
                else if (inv.ClientName.ToLower().Contains(query)) score = 0.7;
                else if (inv.Description != null && inv.Description.ToLower().Contains(query)) score = 0.6;
                else
                {
                    double distance = ComputeLevenshteinDistance(inv.ClientName.ToLower(), query);
                    if (distance <= 2) score = 0.5;
                    else continue;
                }
            }

            results.Add(new SmartSearchResult
            {
                Id = inv.Id,
                Type = "Invoice",
                ReferenceNumber = inv.InvoiceNo,
                Title = $"Invoice {inv.InvoiceNo} â€” {inv.ClientName}",
                Subtitle = inv.Description ?? "No description",
                Amount = inv.TotalAmount,
                Date = inv.BillingDate,
                Status = inv.PaymentStatus,
                MatchScore = score,
                Archived = inv.Archived
            });
        }

        // â”€â”€â”€ 2. Filter and Rank Payments â”€â”€â”€
        foreach (var p in payments)
        {
            if (DateTime.TryParse(p.PaymentDate, out var pDate))
            {
                if (filterStart.HasValue && pDate < filterStart.Value) continue;
                if (filterEnd.HasValue && pDate > filterEnd.Value) continue;
            }

            if (request.PaymentStatuses != null && request.PaymentStatuses.Any())
            {
                // Payments represent completed collection. If filter includes Paid or Successful, it matches.
                bool statusMatch = request.PaymentStatuses.Any(s => s.Equals("Paid", StringComparison.OrdinalIgnoreCase) || 
                                                                    s.Equals("Successful", StringComparison.OrdinalIgnoreCase) ||
                                                                    s.Equals("Successful Payment", StringComparison.OrdinalIgnoreCase));
                if (!statusMatch) continue;
            }

            if (!string.IsNullOrEmpty(request.ClientId) && p.ClientId != request.ClientId)
                continue;

            if (request.MinAmount.HasValue && p.Amount < request.MinAmount.Value) continue;
            if (request.MaxAmount.HasValue && p.Amount > request.MaxAmount.Value) continue;

            double score = 0;
            if (string.IsNullOrEmpty(query))
            {
                score = 0.5;
            }
            else
            {
                if (p.OrNumber.ToLower() == query || p.ReferenceNumber?.ToLower() == query) score = 1.0;
                else if (p.OrNumber.ToLower().Contains(query)) score = 0.8;
                else if (p.ClientName.ToLower().Contains(query)) score = 0.7;
                else if (p.PaymentMethod.ToLower().Contains(query)) score = 0.6;
                else if (p.Remarks != null && p.Remarks.ToLower().Contains(query)) score = 0.6;
                else
                {
                    double distance = ComputeLevenshteinDistance(p.ClientName.ToLower(), query);
                    if (distance <= 2) score = 0.5;
                    else continue;
                }
            }

            results.Add(new SmartSearchResult
            {
                Id = p.Id,
                Type = "Payment",
                ReferenceNumber = p.OrNumber,
                Title = $"Official Receipt {p.OrNumber} â€” {p.ClientName}",
                Subtitle = $"Paid via {p.PaymentMethod}. Ref: {p.ReferenceNumber ?? "N/A"}",
                Amount = p.Amount,
                Date = p.PaymentDate,
                Status = "Successful",
                MatchScore = score,
                Archived = false
            });
        }

        // â”€â”€â”€ 3. Filter and Rank CashFlowTransactions â”€â”€â”€
        foreach (var entry in cashflow)
        {
            if (DateTime.TryParse(entry.Date, out var cfDate))
            {
                if (filterStart.HasValue && cfDate < filterStart.Value) continue;
                if (filterEnd.HasValue && cfDate > filterEnd.Value) continue;
            }

            if (request.TransactionTypes != null && request.TransactionTypes.Any())
            {
                bool matchesType = request.TransactionTypes.Any(t => t.Equals(entry.Type, StringComparison.OrdinalIgnoreCase));
                if (!matchesType) continue;
            }

            if (!string.IsNullOrEmpty(request.CashCategory) && !entry.Category.Equals(request.CashCategory, StringComparison.OrdinalIgnoreCase))
                continue;

            if (request.MinAmount.HasValue && entry.Amount < request.MinAmount.Value) continue;
            if (request.MaxAmount.HasValue && entry.Amount > request.MaxAmount.Value) continue;

            double score = 0;
            if (string.IsNullOrEmpty(query))
            {
                score = 0.5;
            }
            else
            {
                if (entry.ReferenceNo.ToLower() == query) score = 1.0;
                else if (entry.ReferenceNo.ToLower().Contains(query)) score = 0.8;
                else if (entry.Category.ToLower().Contains(query)) score = 0.7;
                else if (entry.Description.ToLower().Contains(query)) score = 0.6;
                else continue;
            }

            results.Add(new SmartSearchResult
            {
                Id = entry.Id,
                Type = "CashFlow",
                ReferenceNumber = entry.ReferenceNo,
                Title = $"Cash {entry.Type} ({entry.Category}) â€” {entry.ReferenceNo}",
                Subtitle = entry.Description,
                Amount = entry.Amount,
                Date = entry.Date,
                Status = entry.Type == "Inflow" ? "Inflow" : "Outflow",
                MatchScore = score,
                Archived = false
            });
        }

        // â”€â”€â”€ 4. Filter and Rank Clients â”€â”€â”€
        if (string.IsNullOrEmpty(request.ClientId))
        {
            foreach (var c in clients)
            {
                if (request.PaymentStatuses != null && request.PaymentStatuses.Any())
                {
                    if (request.PaymentStatuses.Contains("Overdue", StringComparer.OrdinalIgnoreCase) && c.CurrentBalance == 0)
                        continue;
                }

                double score = 0;
                if (string.IsNullOrEmpty(query))
                {
                    score = 0.5;
                }
                else
                {
                    if (c.ClientCode.ToLower() == query) score = 1.0;
                    else if (c.Name.ToLower().Contains(query) || c.BusinessName.ToLower().Contains(query)) score = 0.8;
                    else if (c.ContactPerson.ToLower().Contains(query) || c.Email.ToLower().Contains(query)) score = 0.6;
                    else
                    {
                        double distance = ComputeLevenshteinDistance(c.Name.ToLower(), query);
                        if (distance <= 2) score = 0.5;
                        else continue;
                    }
                }

                results.Add(new SmartSearchResult
                {
                    Id = c.Id,
                    Type = "Client",
                    ReferenceNumber = c.ClientCode,
                    Title = $"Client: {c.Name}",
                    Subtitle = $"Contact: {c.ContactPerson} ({c.Email}) Â· Balance: {c.CurrentBalance:C2}",
                    Amount = c.CurrentBalance,
                    Date = c.DateRegistered,
                    Status = c.Status,
                    MatchScore = score,
                    Archived = c.Archived
                });
            }
        }

        // â”€â”€â”€ 5. Filter and Rank Audit Logs â”€â”€â”€
        foreach (var log in auditLogs)
        {
            if (filterStart.HasValue && log.LoggedAt < filterStart.Value) continue;
            if (filterEnd.HasValue && log.LoggedAt > filterEnd.Value) continue;

            if (!string.IsNullOrEmpty(request.EmployeeId) && log.UserId != request.EmployeeId)
                continue;

            double score = 0;
            if (string.IsNullOrEmpty(query))
            {
                score = 0.5;
            }
            else
            {
                if (log.EntityId.ToLower() == query) score = 1.0;
                else if (log.EntityName.ToLower().Contains(query)) score = 0.8;
                else if (log.Action.ToLower().Contains(query)) score = 0.7;
                else if (log.Details.ToLower().Contains(query)) score = 0.6;
                else continue;
            }

            results.Add(new SmartSearchResult
            {
                Id = log.Id,
                Type = "AuditLog",
                ReferenceNumber = log.EntityId,
                Title = $"Audit Log: {log.Action} on {log.EntityName}",
                Subtitle = $"User: {log.UserId} Â· Details: {log.Details}",
                Amount = 0,
                Date = log.LoggedAt.ToString("yyyy-MM-dd HH:mm"),
                Status = "Log",
                MatchScore = score,
                Archived = false
            });
        }

        // Sort results by matching score desc, then by date desc
        var sorted = results
            .OrderByDescending(r => r.MatchScore)
            .ThenByDescending(r => r.Date)
            .ToList();

        return Ok(sorted);
    }

    private static int ComputeLevenshteinDistance(string s, string t)
    {
        if (string.IsNullOrEmpty(s)) return string.IsNullOrEmpty(t) ? 0 : t.Length;
        if (string.IsNullOrEmpty(t)) return s.Length;

        int n = s.Length;
        int m = t.Length;
        int[,] d = new int[n + 1, m + 1];

        for (int i = 0; i <= n; d[i, 0] = i++) ;
        for (int j = 0; j <= m; d[0, j] = j++) ;

        for (int i = 1; i <= n; i++)
        {
            for (int j = 1; j <= m; j++)
            {
                int cost = (t[j - 1] == s[i - 1]) ? 0 : 1;
                d[i, j] = Math.Min(
                    Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                    d[i - 1, j - 1] + cost);
            }
        }
        return d[n, m];
    }
}
