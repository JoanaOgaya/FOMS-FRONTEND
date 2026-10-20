using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using FOMS.Application.Interfaces;
using FOMS.Domain.Entities;


namespace FOMS.Application.Services;

/// <summary>
/// BillingComputationService — The single authoritative source of truth
/// for all FOMS financial computations (FR-010 to FR-025).
///
/// Official FOMS Billing Formula:
///   Subtotal       = FreightCharges + OtherCharges
///   VAT Amount     = Subtotal × 12%
///   Surcharge      = (Subtotal + VAT) × 5%  [only if invoice is overdue at creation]
///   Total Amount   = Subtotal + VAT + Surcharge
///   Outstanding    = Total Amount − Total Payments Received
///
/// Rules:
///   - VAT is ALWAYS 12% of Subtotal. No exceptions.
///   - No invoice may have VAT = 0 when Subtotal > 0.
///   - No invoice may have Balance < 0.
///   - Aging is always computed dynamically from today's date.
///   - Client.CurrentBalance is always the SUM of unpaid invoice balances.
/// </summary>
public static class BillingComputationService
{
    public const double VAT_RATE = 0.12;
    public const double SURCHARGE_RATE = 0.05;

    // ─────────────────────────────────────────────────────────────────
    // INVOICE COMPUTATION
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Compute the VAT amount: Subtotal × 12%, rounded to 2 decimal places.
    /// </summary>
    public static decimal ComputeVat(decimal subtotal)
        => Math.Round(subtotal * (decimal)VAT_RATE, 2);

    /// <summary>
    /// Compute surcharge (5%) if the invoice due date has already passed.
    /// Surcharge is applied on (Subtotal + VAT).
    /// </summary>
    public static decimal ComputeSurcharge(decimal subtotal, decimal vatAmount, string dueDate)
    {
        if (DateTime.TryParse(dueDate, out var parsedDue) && DateTime.UtcNow.Date > parsedDue.Date)
        {
            return Math.Round((subtotal + vatAmount) * (decimal)SURCHARGE_RATE, 2);
        }
        return 0m;
    }

    /// <summary>
    /// Compute Total Amount = Subtotal + VAT + Surcharge.
    /// </summary>
    public static decimal ComputeTotalAmount(decimal subtotal, decimal vatAmount, decimal surcharge)
        => subtotal + vatAmount + surcharge;

    /// <summary>
    /// Compute Outstanding Balance = TotalAmount − AmountPaid. Never goes below 0.
    /// </summary>
    public static decimal ComputeOutstandingBalance(decimal totalAmount, decimal amountPaid)
        => Math.Max(0m, totalAmount - amountPaid);

    // ─────────────────────────────────────────────────────────────────
    // STATUS ENGINE
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Determine the payment status from balance, amountPaid, and due date.
    ///   Balance = 0                          → Paid
    ///   Balance > 0, Overdue                 → Overdue
    ///   Balance > 0, Not Overdue             → Unpaid
    /// </summary>
    public static string ComputePaymentStatus(decimal balance, decimal amountPaid, string dueDate)
    {
        if (balance <= 0m)
            return "Paid";

        var isOverdue = IsOverdue(dueDate);
        if (isOverdue)
            return "Overdue";

        return "Unpaid";
    }

    // ─────────────────────────────────────────────────────────────────
    // AGING ENGINE
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Compute the number of days the invoice is past due.
    /// Returns 0 if not yet overdue.
    /// Always computed from today — never stored statically.
    /// </summary>
    public static int ComputeDaysOverdue(string dueDate)
    {
        if (!DateTime.TryParse(dueDate, out var parsedDue))
            return 0;
        var days = (int)(DateTime.UtcNow.Date - parsedDue.Date).TotalDays;
        return Math.Max(0, days);
    }

    /// <summary>
    /// Compute the aging bucket from the due date.
    /// Buckets: "Current" | "1-30" | "31-60" | "61-90" | "90+"
    /// Always computed from today — never stored statically.
    /// </summary>
    public static string ComputeAgingBucket(string dueDate)
    {
        var days = ComputeDaysOverdue(dueDate);
        if (days == 0) return "Current";
        if (days <= 30) return "1-30";
        if (days <= 60) return "31-60";
        if (days <= 90) return "61-90";
        return "90+";
    }

    /// <summary>
    /// Returns true if the invoice due date has passed today.
    /// </summary>
    public static bool IsOverdue(string dueDate)
    {
        if (!DateTime.TryParse(dueDate, out var parsedDue))
            return false;
        return DateTime.UtcNow.Date > parsedDue.Date;
    }

    // ─────────────────────────────────────────────────────────────────
    // DYNAMIC AGING REFRESH — called on every GET
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Refresh aging, days-overdue, and payment status on an invoice object
    /// WITHOUT saving to the database. Used when serving GET responses so
    /// that stale DB values are never returned to the client.
    /// </summary>
    public static void RefreshInvoiceAging(Invoice invoice)
    {
        if (invoice.Balance <= 0m)
        {
            invoice.PaymentStatus = "Paid";
            invoice.DaysOverdue = 0;
            invoice.AgingBucket = "Current";
            return;
        }

        invoice.DaysOverdue = ComputeDaysOverdue(invoice.DueDate);
        invoice.AgingBucket = ComputeAgingBucket(invoice.DueDate);
        invoice.PaymentStatus = ComputePaymentStatus(invoice.Balance, invoice.AmountPaid, invoice.DueDate);
    }

    // ─────────────────────────────────────────────────────────────────
    // CLIENT BALANCE ENGINE
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Synchronize Client.CurrentBalance so it always equals
    /// the sum of all unpaid Invoice balances for that client.
    ///
    /// This is the ONLY authoritative way to update a client's balance.
    /// No feature should manually do: client.CurrentBalance -= amount.
    /// </summary>
    public static async Task SyncClientBalanceAsync(
        string clientId,
        IApplicationDbContext context,
        CancellationToken cancellationToken = default)
    {
        var client = await context.Clients
            .FirstOrDefaultAsync(c => c.Id == clientId, cancellationToken);

        if (client == null) return;

        var outstandingBalance = await context.Invoices
            .Where(i => i.ClientId == clientId && !i.Archived)
            .SumAsync(i => i.Balance, cancellationToken);

        var totalBilled = await context.Invoices
            .Where(i => i.ClientId == clientId && !i.Archived)
            .SumAsync(i => i.TotalAmount, cancellationToken);

        var totalPaid = await context.Invoices
            .Where(i => i.ClientId == clientId && !i.Archived)
            .SumAsync(i => i.AmountPaid, cancellationToken);

        client.CurrentBalance = outstandingBalance;
        client.TotalBilled = totalBilled;
        client.TotalPaid = totalPaid;
        client.LastTransaction = DateTime.UtcNow.ToString("MMM dd, yyyy");
    }

    // ─────────────────────────────────────────────────────────────────
    // PAYMENT VALIDATION
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Validate a payment amount before recording it.
    /// Returns null if valid; returns an error message string if invalid.
    /// </summary>
    public static string? ValidatePaymentAmount(decimal amount, decimal outstandingBalance)
    {
        if (amount <= 0m)
            return "Payment amount must be greater than zero.";

        if (amount > outstandingBalance)
            return $"Payment amount ({amount:N2}) exceeds the outstanding balance ({outstandingBalance:N2}). Overpayments are not allowed.";

        return null; // valid
    }

    // ─────────────────────────────────────────────────────────────────
    // DYNAMIC INVOICE & RECEIVABLE SYNCHRONIZATION
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Synchronize standard Billing Invoice (BI-...) and ReceivableBalance when an Invoice is updated.
    /// </summary>
    public static async Task SyncBillingInvoiceAndReceivableAsync(
        Invoice invoice,
        IApplicationDbContext context,
        CancellationToken cancellationToken = default)
    {
        // 1. Determine the corresponding Billing Invoice No
        string billingInvoiceNo;
        var parts = invoice.InvoiceNo.Split('-');
        if (parts.Length >= 3)
        {
            billingInvoiceNo = $"BI-{parts[1]}-{parts[2]}";
        }
        else
        {
            billingInvoiceNo = invoice.InvoiceNo;
        }

        // Only sync if they are actually different (i.e. sync client invoice to billing invoice)
        if (invoice.InvoiceNo != billingInvoiceNo)
        {
            var billingInvoice = await context.Invoices
                .FirstOrDefaultAsync(i => i.InvoiceNo == billingInvoiceNo, cancellationToken);

            if (billingInvoice != null)
            {
                // Sync financial values
                billingInvoice.FreightCharges = invoice.FreightCharges;
                billingInvoice.OtherCharges = invoice.OtherCharges;
                billingInvoice.Subtotal = invoice.Subtotal;
                billingInvoice.VatRate = invoice.VatRate;
                billingInvoice.VatAmount = invoice.VatAmount;
                billingInvoice.Surcharge = invoice.Surcharge;
                billingInvoice.TotalAmount = invoice.TotalAmount;
                billingInvoice.AmountPaid = invoice.AmountPaid;
                billingInvoice.Balance = invoice.Balance;
                billingInvoice.DaysOverdue = invoice.DaysOverdue;
                billingInvoice.AgingBucket = invoice.AgingBucket;
                billingInvoice.PaymentStatus = invoice.PaymentStatus;
                billingInvoice.LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd");
                billingInvoice.UpdatedBy = invoice.UpdatedBy;
                billingInvoice.Archived = invoice.Archived;

                context.Invoices.Update(billingInvoice);
            }
            else
            {
                // If the billing invoice does not exist, create it (e.g., when a client invoice is newly created)
                var billingClientId = invoice.ClientId.StartsWith("CL-") 
                    ? invoice.ClientId.Replace("CL-", "CA-") 
                    : invoice.ClientId;

                billingInvoice = new Invoice
                {
                    Id = billingInvoiceNo,
                    InvoiceNo = billingInvoiceNo,
                    ClientId = billingClientId,
                    ClientName = invoice.ClientName.Contains("Account") ? invoice.ClientName : invoice.ClientName + " Account",
                    BillingDate = invoice.BillingDate,
                    DueDate = invoice.DueDate,
                    FreightCharges = invoice.FreightCharges,
                    OtherCharges = invoice.OtherCharges,
                    Subtotal = invoice.Subtotal,
                    VatRate = invoice.VatRate,
                    VatAmount = invoice.VatAmount,
                    Surcharge = invoice.Surcharge,
                    TotalAmount = invoice.TotalAmount,
                    AmountPaid = invoice.AmountPaid,
                    Balance = invoice.Balance,
                    PaymentStatus = invoice.PaymentStatus,
                    AgingBucket = invoice.AgingBucket,
                    DaysOverdue = invoice.DaysOverdue,
                    Description = invoice.Description,
                    EncodedBy = invoice.EncodedBy,
                    DateEncoded = invoice.DateEncoded,
                    LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd"),
                    UpdatedBy = invoice.UpdatedBy,
                    Archived = invoice.Archived
                };
                context.Invoices.Add(billingInvoice);
            }
        }

        // 2. Synchronize ReceivableBalance record
        // receivableClientId: always use CA- prefix (billing account ID)
        var receivableClientId = invoice.ClientId.StartsWith("CL-") 
            ? invoice.ClientId.Replace("CL-", "CA-") 
            : invoice.ClientId;

        // receivableInvoiceId: always use the BI- invoice number (authoritative FK)
        // Use InvoiceNo (not Id) because BI- invoices created by the sync use InvoiceNo as their Id,
        // but direct billing invoices also need InvoiceNo as the stable identifier.
        var receivableInvoiceId = invoice.InvoiceNo.StartsWith("BI-") ? invoice.InvoiceNo : billingInvoiceNo;

        var receivable = await context.ReceivableBalances
            .FirstOrDefaultAsync(r => r.InvoiceId == receivableInvoiceId, cancellationToken);

        // Remove receivable if archived OR fully paid (balance == 0)
        if (invoice.Archived || invoice.Balance <= 0m)
        {
            if (receivable != null)
            {
                context.ReceivableBalances.Remove(receivable);
            }
        }
        else
        {
            var dueDate = DateTime.TryParse(invoice.DueDate, out var parsedDue) ? parsedDue : DateTime.UtcNow;
            if (receivable != null)
            {
                receivable.BalanceAmount = invoice.Balance;
                receivable.DueDate = dueDate;
                context.ReceivableBalances.Update(receivable);
            }
            else
            {
                // Create new receivable record for this invoice
                receivable = new ReceivableBalance
                {
                    ClientId = receivableClientId,
                    InvoiceId = receivableInvoiceId,
                    BalanceAmount = invoice.Balance,
                    DueDate = dueDate
                };
                context.ReceivableBalances.Add(receivable);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // FULL INVOICE RECALCULATION — called on create and update
    // ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Fully recompute all financial fields on an invoice:
    /// Subtotal, VAT, Surcharge, TotalAmount, Balance, Status, Aging.
    /// Call this any time FreightCharges, OtherCharges, or DueDate changes.
    /// </summary>
    public static void RecalculateInvoice(Invoice invoice)
    {
        // Fallback for seeded/legacy invoices where TotalAmount was manually set but Freight/Other charges were 0.
        // We retroactively set FreightCharges so the recalculation preserves the TotalAmount.
        if (invoice.FreightCharges == 0 && invoice.OtherCharges == 0 && invoice.TotalAmount > 0)
        {
            invoice.Subtotal = invoice.TotalAmount / (decimal)(1 + VAT_RATE);
            invoice.FreightCharges = Math.Round(invoice.Subtotal, 2);
        }

        invoice.Subtotal = invoice.FreightCharges + invoice.OtherCharges;
        invoice.VatRate = VAT_RATE;
        invoice.VatAmount = ComputeVat(invoice.Subtotal);
        invoice.Surcharge = ComputeSurcharge(invoice.Subtotal, invoice.VatAmount, invoice.DueDate);
        invoice.TotalAmount = ComputeTotalAmount(invoice.Subtotal, invoice.VatAmount, invoice.Surcharge);
        invoice.Balance = ComputeOutstandingBalance(invoice.TotalAmount, invoice.AmountPaid);
        invoice.DaysOverdue = ComputeDaysOverdue(invoice.DueDate);
        invoice.AgingBucket = ComputeAgingBucket(invoice.DueDate);
        invoice.PaymentStatus = ComputePaymentStatus(invoice.Balance, invoice.AmountPaid, invoice.DueDate);
        invoice.LastUpdated = DateTime.UtcNow.ToString("yyyy-MM-dd");
    }
}

