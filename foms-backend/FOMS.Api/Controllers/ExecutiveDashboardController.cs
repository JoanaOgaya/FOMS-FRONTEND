using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using FOMS.Application.Interfaces;
using FOMS.Application.Services;
using FOMS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FOMS.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/financial-manager/executive-dashboard")]
[Route("financial-manager/executive-dashboard")]
public class ExecutiveDashboardController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly FomsDbContext _fomsDb;

    public ExecutiveDashboardController(IApplicationDbContext context, FomsDbContext fomsDb)
    {
        _context = context;
        _fomsDb = fomsDb;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? clientId, [FromQuery] string? period = "monthly")
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? User.FindFirst("role")?.Value;
        if (!IsFinancialManager(role))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { success = false, message = "Access denied. Financial Manager role required." });
        }

        var now = DateTime.UtcNow;
        var today = now.Date;
        var invoices = await _context.Invoices
            .AsNoTracking()
            .Where(invoice => !invoice.Archived && (string.IsNullOrEmpty(clientId) || invoice.ClientId == clientId))
            .ToListAsync();

        foreach (var invoice in invoices)
        {
            BillingComputationService.RefreshInvoiceAging(invoice);
        }

        var clientIds = invoices.Select(invoice => invoice.ClientId).Distinct().ToList();
        var clients = await _context.Clients
            .AsNoTracking()
            .Where(client => clientIds.Contains(client.Id))
            .ToListAsync();
        var clientNames = clients.ToDictionary(client => client.Id, client => client.Name);

        var paymentsQuery = _context.Payments.AsNoTracking()
            .Where(payment =>
                (payment.PaymentStatus == "Validated" || payment.PaymentStatus == "Approved") &&
                payment.Flow.ToLower() == "inflow");
        if (!string.IsNullOrEmpty(clientId))
        {
            paymentsQuery = paymentsQuery.Where(payment => payment.ClientId == clientId);
        }
        var payments = await paymentsQuery.ToListAsync();

        var cashFlow = (await _context.CashFlowTransactions
                .AsNoTracking()
                .ToListAsync())
            .Select(transaction => (
                date: transaction.TransactionDate,
                type: transaction.Type,
                amount: transaction.Amount))
            .ToList();

        var totalBilled = invoices.Sum(invoice => invoice.TotalAmount);
        var totalCollected = invoices.Sum(invoice => invoice.AmountPaid);
        var totalArOutstanding = invoices.Where(invoice => invoice.Balance > 0).Sum(invoice => invoice.Balance);
        var collectionRate = totalBilled > 0
            ? Math.Round((double)(totalCollected / totalBilled * 100m), 1)
            : 0d;
        var cashInflowThisMonth = cashFlow
            .Where(row => row.type == "Inflow" && row.date.Month == now.Month && row.date.Year == now.Year)
            .Sum(row => row.amount);

        var nearDueInvoices = invoices
            .Where(invoice =>
                invoice.Balance > 0 &&
                TryGetDate(invoice.DueDate, out var dueDate) &&
                dueDate.Date >= today &&
                dueDate.Date <= today.AddDays(7))
            .Select(invoice =>
            {
                TryGetDate(invoice.DueDate, out var dueDate);
                var daysRemaining = (dueDate.Date - today).Days;
                var name = !string.IsNullOrWhiteSpace(invoice.ClientName)
                    ? invoice.ClientName
                    : clientNames.GetValueOrDefault(invoice.ClientId, invoice.ClientId);
                return new
                {
                    clientId = invoice.ClientId,
                    clientName = name,
                    invoiceNumber = invoice.InvoiceNo,
                    amountDue = invoice.Balance,
                    dueDate = dueDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    daysRemaining
                };
            })
            .GroupBy(invoice => invoice.clientId)
            .Select(group => new
            {
                clientId = group.Key,
                clientName = group.First().clientName,
                invoiceNumber = group.OrderBy(invoice => invoice.daysRemaining).First().invoiceNumber,
                amountDue = group.Sum(invoice => invoice.amountDue),
                dueDate = group.OrderBy(invoice => invoice.daysRemaining).First().dueDate,
                daysRemaining = group.Min(invoice => invoice.daysRemaining)
            })
            .OrderBy(invoice => invoice.daysRemaining)
            .ToList();

        var agingBuckets = new[]
        {
            new { label = "Current", value = invoices.Where(invoice => invoice.Balance > 0 && invoice.DaysOverdue <= 0).Sum(invoice => invoice.Balance) },
            new { label = "0-30 days", value = invoices.Where(invoice => invoice.Balance > 0 && invoice.DaysOverdue is > 0 and <= 30).Sum(invoice => invoice.Balance) },
            new { label = "31-60 days", value = invoices.Where(invoice => invoice.Balance > 0 && invoice.DaysOverdue is > 30 and <= 60).Sum(invoice => invoice.Balance) },
            new { label = "61-90 days", value = invoices.Where(invoice => invoice.Balance > 0 && invoice.DaysOverdue is > 60 and <= 90).Sum(invoice => invoice.Balance) },
            new { label = "90+ days", value = invoices.Where(invoice => invoice.Balance > 0 && invoice.DaysOverdue > 90).Sum(invoice => invoice.Balance) }
        };

        var topPayingClients = payments
            .GroupBy(payment => payment.ClientId)
            .Select(group => new
            {
                clientId = group.Key,
                clientName = group.Select(payment => payment.ClientName).FirstOrDefault(name => !string.IsNullOrWhiteSpace(name))
                    ?? clientNames.GetValueOrDefault(group.Key, group.Key),
                amount = group.Sum(payment => payment.Amount)
            })
            .OrderByDescending(client => client.amount)
            .Take(5)
            .ToList();

        var duplicateAlerts = await _fomsDb.AIReviewHistories
            .AsNoTracking()
            .CountAsync(review => review.IsDeleted != true && review.FinalDecision != null &&
                (review.FinalDecision.Contains("Duplicate") || review.FinalDecision.Contains("Flagged") || review.FinalDecision.Contains("FLAGGED") || review.FinalDecision.Contains("PENDING_REVIEW")));

        var recentLogs = await _context.AuditLogs
            .AsNoTracking()
            .OrderByDescending(log => log.LoggedAt)
            .Take(5)
            .ToListAsync();
        var recentUserIds = recentLogs
            .Select(log => log.UserId)
            .Where(userId => !string.IsNullOrWhiteSpace(userId))
            .Distinct()
            .ToList();
        var recentUsers = await _context.Employees
            .AsNoTracking()
            .Where(user => recentUserIds.Contains(user.Id))
            .ToDictionaryAsync(user => user.Id, user => user.Name);
        var recentActivity = recentLogs.Select(log => new
        {
            id = log.Id,
            timestamp = log.LoggedAt,
            userId = log.UserId,
            userFullName = recentUsers.TryGetValue(log.UserId, out var userName)
                ? userName
                : log.UserId,
            userRole = string.Empty,
            action = log.Action,
            module = log.EntityName,
            recordId = log.EntityId,
            recordType = log.EntityName,
            details = log.Details,
            ipAddress = string.Empty
        }).ToList();

        var insights = new List<object>();
        var overdueInvoices = invoices
            .Where(invoice => invoice.Balance > 0 &&
                TryGetDate(invoice.DueDate, out var dueDate) &&
                dueDate.Date < today)
            .ToList();
        if (overdueInvoices.Count > 0)
        {
            insights.Add(new
            {
                id = "overdue-receivables",
                type = "collection",
                title = "Overdue receivables need follow-up",
                message = $"{overdueInvoices.Count} overdue invoice(s) with {FormatCurrency(overdueInvoices.Sum(invoice => invoice.Balance))} outstanding.",
                severity = "high",
                entityId = overdueInvoices[0].Id,
                targetRoute = "/accounts-receivable",
                createdAt = now
            });
        }
        else if (nearDueInvoices.Count > 0)
        {
            insights.Add(new
            {
                id = "upcoming-receivables",
                type = "collection",
                title = "Receivables due soon",
                message = $"{nearDueInvoices.Count} account(s) have {FormatCurrency(nearDueInvoices.Sum(account => account.amountDue))} due within 7 days.",
                severity = "medium",
                entityId = nearDueInvoices[0].invoiceNumber,
                targetRoute = "/accounts-receivable",
                createdAt = now
            });
        }

        if (duplicateAlerts > 0)
        {
            insights.Add(new
            {
                id = "open-duplicate-alerts",
                type = "duplicate",
                title = "Duplicate alerts need review",
                message = $"{duplicateAlerts} open duplicate alert(s) are awaiting review.",
                severity = "high",
                entityId = (string?)null,
                targetRoute = "/flagged-duplicates",
                createdAt = now
            });
        }

        var monthly = string.Equals(period, "monthly", StringComparison.OrdinalIgnoreCase);
        var cashFlowAnalytics = monthly
            ? Enumerable.Range(1, 12)
                .Select(month =>
                {
                    var monthStart = new DateTime(now.Year, month, 1, 0, 0, 0, DateTimeKind.Utc);
                    var rows = cashFlow.Where(row => row.date.Year == now.Year && row.date.Month == month).ToList();
                    var inflow = rows.Where(row => row.type == "Inflow").Sum(row => row.amount);
                    var outflow = rows.Where(row => row.type == "Outflow").Sum(row => row.amount);
                    return new
                    {
                        period = monthStart.ToString("MMM", CultureInfo.InvariantCulture),
                        inflow,
                        outflow,
                        net = inflow - outflow
                    };
                })
                .ToList()
            : Enumerable.Range(0, 7)
                .Select(offset =>
                {
                    var date = today.AddDays(offset - 6);
                    var rows = cashFlow.Where(row => row.date.Date == date).ToList();
                    var inflow = rows.Where(row => row.type == "Inflow").Sum(row => row.amount);
                    var outflow = rows.Where(row => row.type == "Outflow").Sum(row => row.amount);
                    return new
                    {
                        period = date.ToString("ddd", CultureInfo.InvariantCulture),
                        inflow,
                        outflow,
                        net = inflow - outflow
                    };
                })
                .ToList();

        return Ok(new
        {
            success = true,
            data = new
            {
                asOf = now,
                period = monthly ? "monthly" : "weekly",
                clientId,
                totalInvoicesBilled = invoices.Count,
                totalInvoiceAmount = totalBilled,
                totalCollected,
                totalArOutstanding,
                collectionRate,
                cashInflowThisMonth,
                duplicateAlerts,
                accountsNearDueDate = nearDueInvoices.Count,
                cashFlowAnalytics,
                agingBuckets,
                topPayingClients,
                nearDueAccounts = nearDueInvoices,
                recentActivity,
                insights
            }
        });
    }

    private static string FormatCurrency(decimal amount) =>
        $"₱{amount.ToString("N2", CultureInfo.InvariantCulture)}";

    private static bool IsFinancialManager(string? role) =>
        string.Equals(role, "Financial Manager", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "Finance Manager", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "FINANCIAL_MANAGER", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "FINANCE_MANAGER", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "System Admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "SYSTEM_ADMIN", StringComparison.OrdinalIgnoreCase);

    private static bool TryGetDate(string? value, out DateTime date) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out date);
}
