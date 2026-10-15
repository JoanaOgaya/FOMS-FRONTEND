using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FOMS.Domain.Entities.SqlServer;

[Table("Roles")]
public class Role
{
    [Key]
    [Column("role_id")]
    public int RoleId { get; set; }

    [Column("role_name")]
    public string RoleName { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("Users")]
public class User
{
    [Key]
    [Column("user_id")]
    public int UserId { get; set; }

    [Column("employee_number")]
    public string? EmployeeNumber { get; set; }

    [Column("full_name")]
    public string FullName { get; set; } = string.Empty;

    [Column("username")]
    public string Username { get; set; } = string.Empty;

    [Column("password_hash")]
    public string PasswordHash { get; set; } = string.Empty;

    [Column("role_id")]
    public int RoleId { get; set; }

    [Column("is_active")]
    public bool? IsActive { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }
}

[Table("Clients")]
public class Client
{
    [Key]
    [Column("client_id")]
    public int ClientId { get; set; }

    // NOTE: dbo.Clients is created by the InitialSqlServerCreate migration with PascalCase
    // columns. Only client_id and company_name are snake_case (added by
    // scripts/create_foms_missing_tables.sql), so the mappings below must match that schema.
    [Column("DmsClientId")]
    public string? DmsClientId { get; set; }

    [Column("ClientCode")]
    public string? ClientCode { get; set; }

    [Column("company_name")]
    public string CompanyName { get; set; } = string.Empty;

    [Column("Address")]
    public string? Address { get; set; }

    [Column("ContactPerson")]
    public string? ContactPerson { get; set; }

    [Column("ContactNumber")]
    public string? ContactNumber { get; set; }

    [Column("Email")]
    public string? Email { get; set; }

    [Column("IsActive")]
    public bool? IsActive { get; set; }

    [Column("SyncedFromDms")]
    public bool? SyncedFromDms { get; set; }

    [Column("LastSyncedAt")]
    public DateTime? LastSyncedAt { get; set; }

    [Column("CreatedAt")]
    public DateTime? CreatedAt { get; set; }

    [Column("UpdatedAt")]
    public DateTime? UpdatedAt { get; set; }
}

[Table("ClientFinanceSettings")]
public class ClientFinanceSetting
{
    [Key]
    [Column("client_id")]
    public int ClientId { get; set; }

    [Column("billing_terms")]
    public string? BillingTerms { get; set; }

    [Column("payment_terms")]
    public string? PaymentTerms { get; set; }

    [Column("credit_terms_days")]
    public int? CreditTermsDays { get; set; }

    [Column("tax_type")]
    public string? TaxType { get; set; }

    [Column("oda_rate_applicable")]
    public bool? OdaRateApplicable { get; set; }

    [Column("finance_status")]
    public string? FinanceStatus { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }
}

[Table("ClientRates")]
public class ClientRate
{
    [Key]
    [Column("rate_id")]
    public int RateId { get; set; }

    [Column("client_id")]
    public int ClientId { get; set; }

    [Column("service_type")]
    public string? ServiceType { get; set; }

    [Column("delivery_area")]
    public string? DeliveryArea { get; set; }

    [Column("minimum_kg")]
    public decimal? MinimumKg { get; set; }

    [Column("minimum_rate")]
    public decimal? MinimumRate { get; set; }

    [Column("excess_rate_per_kg")]
    public decimal? ExcessRatePerKg { get; set; }

    [Column("oda_rate")]
    public decimal? OdaRate { get; set; }

    [Column("fuel_surcharge_rate")]
    public decimal? FuelSurchargeRate { get; set; }

    [Column("valuation_rate")]
    public decimal? ValuationRate { get; set; }

    [Column("effective_from")]
    public DateOnly? EffectiveFrom { get; set; }

    [Column("effective_to")]
    public DateOnly? EffectiveTo { get; set; }

    [Column("is_active")]
    public bool? IsActive { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }
}

[Table("Invoices")]
public class Invoice
{
    [Key]
    [Column("invoice_id")]
    public int InvoiceId { get; set; }

    [Column("invoice_number")]
    public string InvoiceNumber { get; set; } = string.Empty;

    [Column("client_id")]
    public int? ClientId { get; set; }

    [Column("billing_period")]
    public string? BillingPeriod { get; set; }

    [Column("due_date")]
    public DateOnly? DueDate { get; set; }

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("paid_amount")]
    public decimal? PaidAmount { get; set; }

    [Column("outstanding_balance")]
    public decimal? OutstandingBalance { get; set; }

    [Column("invoice_status")]
    public string? InvoiceStatus { get; set; }

    [Column("validation_status")]
    public string? ValidationStatus { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }
}

[Table("AccountsReceivable")]
public class AccountsReceivable
{
    [Key]
    [Column("ar_id")]
    public int ArId { get; set; }

    [Column("invoice_id")]
    public int InvoiceId { get; set; }

    [Column("client_id")]
    public int ClientId { get; set; }

    [Column("invoice_amount")]
    public decimal InvoiceAmount { get; set; }

    [Column("paid_amount")]
    public decimal? PaidAmount { get; set; }

    [Column("outstanding_balance")]
    public decimal? OutstandingBalance { get; set; }

    [Column("overpayment_amount")]
    public decimal? OverpaymentAmount { get; set; }

    [Column("ar_status")]
    public string? ArStatus { get; set; }

    [Column("due_date")]
    public DateOnly? DueDate { get; set; }

    [Column("aging_bucket")]
    public string? AgingBucket { get; set; }

    [Column("collection_priority")]
    public string? CollectionPriority { get; set; }

    [Column("refund_status")]
    public string? RefundStatus { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }
}

[Table("Payments")]
public class Payment
{
    [Key]
    [Column("payment_id")]
    public int PaymentId { get; set; }

    [Column("invoice_id")]
    public int? InvoiceId { get; set; }

    [Column("client_id")]
    public int? ClientId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("payment_method")]
    public string? PaymentMethod { get; set; }

    [Column("reference_number")]
    public string? ReferenceNumber { get; set; }

    [Column("proof_of_payment_path")]
    public string? ProofOfPaymentPath { get; set; }

    [Column("payment_status")]
    public string? PaymentStatus { get; set; }

    [Column("submitted_at")]
    public DateTime? SubmittedAt { get; set; }

    [Column("validated_at")]
    public DateTime? ValidatedAt { get; set; }

    [Column("validated_by")]
    public int? ValidatedBy { get; set; }

    [Column("rejected_at")]
    public DateTime? RejectedAt { get; set; }

    [Column("rejected_by")]
    public int? RejectedBy { get; set; }

    [Column("rejection_reason")]
    public string? RejectionReason { get; set; }

    [Column("remarks")]
    public string? Remarks { get; set; }
}

[Table("PaymentHistory")]
public class PaymentHistory
{
    [Key]
    [Column("history_id")]
    public int HistoryId { get; set; }

    [Column("payment_id")]
    public int? PaymentId { get; set; }

    [Column("invoice_id")]
    public int? InvoiceId { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("action")]
    public string? Action { get; set; }

    [Column("remarks")]
    public string? Remarks { get; set; }

    [Column("performed_by")]
    public int? PerformedBy { get; set; }

    [Column("performed_role")]
    public string? PerformedRole { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("Notifications")]
public class Notification
{
    [Key]
    [Column("notification_id")]
    public int NotificationId { get; set; }

    [Column("recipient_user_id")]
    public int? RecipientUserId { get; set; }

    [Column("recipient_role")]
    public string? RecipientRole { get; set; }

    [Column("type")]
    public string? Type { get; set; }

    [Column("title")]
    public string? Title { get; set; }

    [Column("message")]
    public string? Message { get; set; }

    [Column("related_record_type")]
    public string? RelatedRecordType { get; set; }

    [Column("related_record_id")]
    public int? RelatedRecordId { get; set; }

    [Column("is_read")]
    public bool? IsRead { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("AuditLogs")]
public class AuditLog
{
    [Key]
    [Column("audit_id")]
    public int audit_id { get; set; }

    [Column("user_id")]
    public int? user_id { get; set; }

    [Column("role")]
    public string? role { get; set; }

    [Column("action")]
    public string action { get; set; } = string.Empty;

    [Column("module")]
    public string module { get; set; } = string.Empty;

    [Column("affected_record_type")]
    public string? affected_record_type { get; set; }

    [Column("affected_record_id")]
    public int? affected_record_id { get; set; }

    [Column("before_value")]
    public string? before_value { get; set; }

    [Column("after_value")]
    public string? after_value { get; set; }

    [Column("remarks")]
    public string? remarks { get; set; }

    [Column("created_at")]
    public DateTime? created_at { get; set; }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW ENTITIES — Financial Manager backend integration
// ═══════════════════════════════════════════════════════════════════════════

[Table("Waybills")]
public class Waybill
{
    [Key]
    [Column("waybill_id")]
    public int WaybillId { get; set; }

    [Column("waybill_number")]
    public string WaybillNumber { get; set; } = string.Empty;

    [Column("client_id")]
    public int ClientId { get; set; }

    [Column("origin")]
    public string? Origin { get; set; }

    [Column("destination")]
    public string? Destination { get; set; }

    [Column("delivery_area")]
    public string? DeliveryArea { get; set; }

    [Column("actual_weight")]
    public decimal? ActualWeight { get; set; }

    [Column("length_cm")]
    public decimal? LengthCm { get; set; }

    [Column("width_cm")]
    public decimal? WidthCm { get; set; }

    [Column("height_cm")]
    public decimal? HeightCm { get; set; }

    [Column("number_of_boxes")]
    public int? NumberOfBoxes { get; set; }

    [Column("declared_value")]
    public decimal? DeclaredValue { get; set; }

    [Column("delivery_status")]
    public string? DeliveryStatus { get; set; }

    [Column("pod_status")]
    public string? PodStatus { get; set; }

    [Column("is_billed")]
    public bool IsBilled { get; set; } = false;

    [Column("invoice_id")]
    public int? InvoiceId { get; set; }

    [Column("invoice_no")]
    public string? InvoiceNo { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }
}

[Table("BillingDocuments")]
public class BillingDocument
{
    [Key]
    [Column("billing_doc_id")]
    public int BillingDocId { get; set; }

    [Column("waybill_id")]
    public int WaybillId { get; set; }

    [Column("client_id")]
    public int ClientId { get; set; }

    [Column("computed_amount")]
    public decimal ComputedAmount { get; set; }

    [Column("validation_status")]
    public string? ValidationStatus { get; set; }

    [Column("ctc_status")]
    public string? CtcStatus { get; set; }

    [Column("validated_by")]
    public int? ValidatedBy { get; set; }

    [Column("validated_at")]
    public DateTime? ValidatedAt { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("InvoiceLineItems")]
public class InvoiceLineItem
{
    [Key]
    [Column("line_item_id")]
    public int LineItemId { get; set; }

    [Column("invoice_id")]
    public int InvoiceId { get; set; }

    [Column("waybill_id")]
    public int? WaybillId { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Column("quantity")]
    public int Quantity { get; set; } = 1;

    [Column("unit_price")]
    public decimal UnitPrice { get; set; }

    [Column("line_total")]
    public decimal LineTotal { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("InvoiceComputations")]
public class InvoiceComputation
{
    [Key]
    [Column("computation_id")]
    public int ComputationId { get; set; }

    [Column("invoice_id")]
    public int InvoiceId { get; set; }

    [Column("subtotal")]
    public decimal Subtotal { get; set; }

    [Column("vat_amount")]
    public decimal VatAmount { get; set; }

    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; }

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("computed_by")]
    public int? ComputedBy { get; set; }

    [Column("computed_at")]
    public DateTime? ComputedAt { get; set; }
}

[Table("FomsOfficialReceipts")]
public class FomsOfficialReceipt
{
    [Key]
    [Column("or_id")]
    public int OrId { get; set; }

    [Column("invoice_id")]
    public int? InvoiceId { get; set; }

    [Column("payment_id")]
    public int? PaymentId { get; set; }

    [Column("client_id")]
    public int? ClientId { get; set; }

    [Column("or_number")]
    public string OrNumber { get; set; } = string.Empty;

    [Column("issued_amount")]
    public decimal IssuedAmount { get; set; }

    [Column("issued_by")]
    public string? IssuedBy { get; set; }

    [Column("issued_at")]
    public DateTime? IssuedAt { get; set; }

    [Column("pdf_path")]
    public string? PdfPath { get; set; }

    [Column("status")]
    public string? Status { get; set; }
}

[Table("CashInflows")]
public class CashInflow
{
    [Key]
    [Column("inflow_id")]
    public int InflowId { get; set; }

    [Column("payment_id")]
    public int? PaymentId { get; set; }

    [Column("client_id")]
    public int? ClientId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("source")]
    public string? Source { get; set; }

    [Column("reference_number")]
    public string? ReferenceNumber { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("transaction_date")]
    public DateTime? TransactionDate { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("CashOutflows")]
public class CashOutflow
{
    [Key]
    [Column("outflow_id")]
    public int OutflowId { get; set; }

    [Column("category")]
    public string? Category { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("approved_by")]
    public int? ApprovedBy { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("transaction_date")]
    public DateTime? TransactionDate { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("CashAdvances")]
public class CashAdvance
{
    [Key]
    [Column("cash_advance_id")]
    public int CashAdvanceId { get; set; }

    [Column("employee_id")]
    public int? EmployeeId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("purpose")]
    public string? Purpose { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("approved_by")]
    public int? ApprovedBy { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("Liquidations")]
public class Liquidation
{
    [Key]
    [Column("liquidation_id")]
    public int LiquidationId { get; set; }

    [Column("reference_number")]
    public string? ReferenceNumber { get; set; }

    [Column("cash_advance_id")]
    public int? CashAdvanceId { get; set; }

    [Column("submitted_by")]
    public int? SubmittedBy { get; set; }

    [Column("submitted_by_name")]
    public string? SubmittedByName { get; set; }

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("leftover_cash")]
    public decimal? LeftoverCash { get; set; }

    [Column("reimbursement_amount")]
    public decimal? ReimbursementAmount { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("validated_by")]
    public int? ValidatedBy { get; set; }

    [Column("validated_at")]
    public DateTime? ValidatedAt { get; set; }

    [Column("date_submitted")]
    public DateTime? DateSubmitted { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("LiquidationLineItems")]
public class LiquidationLineItem
{
    [Key]
    [Column("line_item_id")]
    public int LineItemId { get; set; }

    [Column("liquidation_id")]
    public int LiquidationId { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("receipt_attached")]
    public bool ReceiptAttached { get; set; } = false;

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("LiquidationDocuments")]
public class LiquidationDocument
{
    [Key]
    [Column("document_id")]
    public int DocumentId { get; set; }

    [Column("liquidation_id")]
    public int LiquidationId { get; set; }

    [Column("document_type")]
    public string? DocumentType { get; set; }

    [Column("file_path")]
    public string? FilePath { get; set; }

    [Column("uploaded_at")]
    public DateTime? UploadedAt { get; set; }
}

[Table("FinancialAdjustments")]
public class FinancialAdjustment
{
    [Key]
    [Column("adjustment_id")]
    public int AdjustmentId { get; set; }

    [Column("invoice_id")]
    public int? InvoiceId { get; set; }

    [Column("client_id")]
    public int? ClientId { get; set; }

    [Column("adjustment_type")]
    public string? AdjustmentType { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("reason")]
    public string? Reason { get; set; }

    [Column("requested_by")]
    public int? RequestedBy { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("approved_by")]
    public int? ApprovedBy { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("CreditMemos")]
public class CreditMemo
{
    [Key]
    [Column("credit_memo_id")]
    public int CreditMemoId { get; set; }

    [Column("invoice_id")]
    public int? InvoiceId { get; set; }

    [Column("client_id")]
    public int? ClientId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("reason")]
    public string? Reason { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("approved_by")]
    public int? ApprovedBy { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("RefundRequests")]
public class RefundRequest
{
    [Key]
    [Column("refund_id")]
    public int RefundId { get; set; }

    [Column("payment_id")]
    public int? PaymentId { get; set; }

    [Column("client_id")]
    public int? ClientId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("reason")]
    public string? Reason { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("processed_by")]
    public int? ProcessedBy { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("Settlements")]
public class Settlement
{
    [Key]
    [Column("settlement_id")]
    public int SettlementId { get; set; }

    [Column("record_type")]
    public string? RecordType { get; set; }

    [Column("courier_trip")]
    public string? CourierTrip { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("submitted_by")]
    public int? SubmittedBy { get; set; }

    [Column("submitted_at")]
    public DateTime? SubmittedAt { get; set; }

    [Column("status")]
    public string? Status { get; set; }

    [Column("validated_by")]
    public int? ValidatedBy { get; set; }

    [Column("validated_at")]
    public DateTime? ValidatedAt { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("AIReviewHistory")]
public class AIReviewHistory
{
    [Key]
    [Column("review_id")]
    public int ReviewId { get; set; }

    [Column("document_number")]
    public string? DocumentNumber { get; set; }

    [Column("final_decision")]
    public string? FinalDecision { get; set; }

    [Column("reviewer")]
    public string? Reviewer { get; set; }

    [Column("decision_reason")]
    public string? DecisionReason { get; set; }

    [Column("reviewed_date")]
    public DateTime? ReviewedDate { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

[Table("AIOutputHistory")]
public class AIOutputHistory
{
    [Key]
    [Column("output_id")]
    public int OutputId { get; set; }

    [Column("output_type")]
    public string? OutputType { get; set; }

    [Column("source_reference")]
    public string? SourceReference { get; set; }

    [Column("processing_status")]
    public string? ProcessingStatus { get; set; }

    [Column("model_name")]
    public string? ModelName { get; set; }

    [Column("version")]
    public string? Version { get; set; }

    [Column("message")]
    public string? Message { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }
}

