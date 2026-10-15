# FOMS Page-by-Page Workflow: EMP-001 (Financial Manager)

- **User**: `EMP-001`
- **Employee Name**: Crystalyn Joyce C. Fajardo
- **Role**: `FINANCIAL_MANAGER` (`FM`)
- **Default Landing Route**: `/dashboard`
- **Authentication**: JWT Bearer token via `POST /auth/login` (payload: `{"username": "EMP-001", "password": "Password@123"}`)

---

## Step 1: Role & Navigation Architecture

`EMP-001` possesses the `FINANCIAL_MANAGER` role. The application enforces role-based access control via `src/utils/roleAccess.ts` and `<RoleGuard>` in `src/components/ProtectedRoute.tsx`.

The sidebar presents 20 modules organized under 8 functional groups in declaration order:

1. **Overview**
   - Executive Dashboard (`/dashboard`)
2. **Client Management**
   - Client Accounts (`/clients`)
3. **Invoicing**
   - Invoice List (`/invoicing-desk`)
   - Billing Validation (`/billing-validation`)
   - Invoice Review (`/invoice-review`)
4. **Receivables & Payments**
   - Accounts Receivable (`/accounts-receivable`)
   - Payments (`/payments`)
   - SpeedPay Validation (`/speedpay-validation`)
   - Official Receipts (`/receipts`)
   - Settlement Validation (`/settlements`)
   - Record Settlement (`/record-settlement`)
   - Adjustment Approval (`/adjustments`)
5. **Liquidation**
   - Liquidation Reports (`/liquidations`)
6. **Treasury**
   - Cash Flow (`/cash-flow`)
7. **Duplicate Detection**
   - Unique Documents (`/unique-documents`)
   - Flagged Duplicates (`/flagged-duplicates`)
   - Review History (`/review-history`)
8. **Analytics & Control**
   - Reports (`/reports`)
   - Audit Logs (`/audit-logs`)
   - AI Output History (`/ai-history`)

**Non-nav routable pages**:
- My Profile (`/profile`)
- Notifications (`/notifications`)

**Forbidden to EMP-001 (Renders 403 ForbiddenPage)**:
- Duplicate Scan (`/duplicate-scan`) — Restricted to Accountant and Assistant FM
- Document Extraction (`/document-extraction`) — Restricted to Accountant and Assistant FM

---

## Step 2: Page-by-Page Interactive Flow

---

### 1. Executive Dashboard
- **Route**: `/dashboard`
- **Allowed Roles**: `FINANCIAL_MANAGER`, `HEAD_ACCOUNTANT`, `ACCOUNTANT`, `ASSISTANT_FM` (renders role-specific executive view for `FINANCIAL_MANAGER`).
- **Data Source**:
  - `dashboardService.financeManagerExecutive({ clientId, period })` -> `GET /financial-manager/executive-dashboard`
- **Interactive Controls**:
  - **Period Toggle Buttons** (`Weekly` / `Monthly`): Switches Cash Flow Analytics chart timeframe; calls `dashboardService.financeManagerExecutive` with updated `period`.
  - **Inflow / Outflow Toggles**: Filters display series on cash flow area chart.
  - **Needs your attention: Duplicate Alerts "Review →" Button**: Navigates to `/flagged-duplicates`.
  - **Needs your attention: Near Due Accounts "View →" Button**: Navigates to `/accounts-receivable`.
  - **Top Paying Clients "View all clients →" Link**: Navigates to `/payments`.
  - **Accounts Near Due Date "View all →" Link**: Navigates to `/accounts-receivable`.
  - **Recent Activity "View all →" Link**: Navigates to `/audit-logs`.
  - **Duplicate Detection Summary "Open Flagged Duplicates" Button**: Navigates to `/flagged-duplicates`.
  - **Live Financial & Workflow Alerts "Review →" Button**: Navigates to `insight.targetRoute` (e.g., `/invoice-review`, `/speedpay-validation`, `/adjustments`).
- **States**:
  - **Loading**: Displays `Loading executive dashboard…` status container.
  - **Error**: Displays `<ErrorState />` with "Retry" button calling `dashboardQuery.refetch()`.
  - **Empty**: Renders localized notices ("No cash-flow transactions recorded for this period", "No payment data yet", "No accounts are near their due date", "No open financial or workflow alerts").
  - **403**: N/A for `/dashboard` (all roles have view access).

---

### 2. Client Accounts
- **Route**: `/clients` (Detail: `/clients/:id`)
- **Allowed Roles**: `ACCOUNTANT` (`view`, `create`, `edit`), `FINANCIAL_MANAGER` (`view`).
- **Data Source**:
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `paymentsService.list({ pageSize: 100 })` -> `GET /payments`
  - `ratesService.list({ pageSize: 100 })` -> `GET /rates`
  - `waybillsService.list({ pageSize: 100 })` -> `GET /shipment-records`
- **Interactive Controls**:
  - **Search Input**: Filters client cards in real-time by client name, contact person, or client ID.
  - **Status Filter Dropdown**: Filters by `All`, `Active`, or `Inactive`.
  - **Client Card Click / "View Details"**: Navigates to `/clients/:id`.
  - **Client Card "Quick View" Button**: Opens the Account Recommendation modal.
  - **Quick View Modal "View Full Account"**: Navigates to `/clients/:id`.
  - **Quick View Modal "Export PDF"**: Generates and downloads a client statement PDF.
  - **Quick View Modal Close Button ("X")**: Dismisses the modal.
  - **Detail View (`/clients/:id`) "Back to Clients" Button**: Navigates back to `/clients`.
  - **Detail View Invoice "View Details" Button**: Opens invoice line item breakdown with waybills search and copy invoice number button.
  - **Detail View Payment "View OR" Button**: Opens official receipt modal with "Download Official Receipt" button.
- **States**:
  - **Loading**: Data tables and metrics show skeleton/loading indicators.
  - **Error**: Catches fetch failures and reports toast notifications.
  - **Empty**: Displays "No client accounts found matching your filters." / "No billing history found for this client."
  - **403**: Handled by `<RoleGuard module="clients">`.

---

### 3. Invoice List
- **Route**: `/invoicing-desk` (Detail: `/invoicing-desk/:id`)
- **Allowed Roles**: `ACCOUNTANT` (`view`, `edit`, `submit`), `HEAD_ACCOUNTANT` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
  - `paymentsService.list({ pageSize: 100 })` -> `GET /payments`
- **Interactive Controls**:
  - **Search Input**: Filters invoices by invoice number, client name, or billing period.
  - **Client Filter Dropdown**: Scopes invoices to a specific client.
  - **Status Filter Dropdown**: Filters by `All`, `Draft`, `Pending Approval`, `Approved`, `Sent`, `Paid`.
  - **Date Range Pickers** (`filterDateFrom`, `filterDateTo`): Scopes invoice creation dates.
  - **Invoice Card "VIEW" Button**: Navigates to `/invoicing-desk/:id`.
  - **Invoice Card "Submit for Approval" Button** (if Draft / Needs Revision): Calls `invoicesService.update(id, { status: 'Pending Approval' })` and logs audit entry.
  - **Detail View (`/invoicing-desk/:id`) "Back to Invoices" Button**: Navigates to `/invoicing-desk`.
  - **Detail View "Mark as Sent" Button** (if Approved): Calls `invoicesService.update(id, { status: 'Sent' })`.
- **States**:
  - **Loading**: Shows skeleton loaders for invoice cards.
  - **Error**: Displays toast error message.
  - **Empty**: Displays "No invoices found matching your filters."
  - **403**: Handled by `<RoleGuard module="invoicingDesk">`.

---

### 4. Billing Validation
- **Route**: `/billing-validation`
- **Allowed Roles**: `ACCOUNTANT` (`view`), `HEAD_ACCOUNTANT` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `ratesService.records.list({ pageSize: 100 })` -> `GET /rates/records`
  - `waybillsService.list({ pageSize: 100 })` -> `GET /shipment-records`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
  - `ratesService.list({ pageSize: 100 })` -> `GET /rates`
- **Interactive Controls**:
  - **Search Input**: Real-time query matching waybill number, client name, or status.
  - **Client Filter Dropdown**: Filter by associated client.
  - **Status Filter Dropdown**: Filter by `Pending Review`, `Approved`, `Returned`.
  - **"Approve" Action Button**: Calls `ratesService.records.act(id, 'approve')` -> updates status to `Approved`.
  - **"Return" Action Button**: Calls `ratesService.records.act(id, 'reject')` -> updates status to `Returned`.
  - **"View Breakdown" Button**: Opens modal with full freight, weight, valuation, fuel surcharge, and VAT calculations.
  - **Pagination Controls** (`Previous` / `Next`): Navigates through billing pages.
- **States**:
  - **Loading**: Renders loading spinners.
  - **Error**: Shows toast errors if approval/rejection fails.
  - **Empty**: Displays "No billing records found matching your filters."
  - **403**: Handled by `<RoleGuard module="billingValidation">`.

---

### 5. Invoice Review
- **Route**: `/invoice-review` (Detail: `/invoice-review/:id`)
- **Allowed Roles**: `HEAD_ACCOUNTANT` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `waybillsService.list({ pageSize: 200 })` -> `GET /shipment-records`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
  - `ratesService.list({ pageSize: 100 })` -> `GET /rates`
- **Interactive Controls**:
  - **Search Input**: Filters by invoice number, client name, billing period, or creation date.
  - **Status Filter Tabs** (`ALL`, `Pending Approval`, `Approved`): Filters invoice review deck.
  - **Client Filter Dropdown**: Restricts cards to a single client.
  - **Invoice Card "REVIEW" Button**: Opens the comprehensive Invoice Review Modal.
  - **Review Modal "Waybills Breakdown" Accordion**: Expands waybills and rate computations.
  - **Review Modal "Approve Invoice" Button**: Calls `invoicesService.act(id, 'approve')` -> transitions status to `Approved` and writes to audit log.
  - **Review Modal "Return for Revision" Button**: Shows remarks textarea.
  - **Review Modal "Submit Return" Button**: Validates remarks and calls `invoicesService.act(id, 'reject', { remarks })` -> transitions status to `Needs Revision`.
  - **Review Modal Close ("X")**: Dismisses the review modal without making state changes.
- **States**:
  - **Loading**: Shows loading indicators.
  - **Error**: Triggers error toast on failed transition.
  - **Empty**: Displays "No invoices requiring review."
  - **403**: Handled by `<RoleGuard module="invoiceReview">`.

---

### 6. Accounts Receivable
- **Route**: `/accounts-receivable` (Detail: `/accounts-receivable/:id`)
- **Allowed Roles**: `ACCOUNTANT` (`view`, `create`), `HEAD_ACCOUNTANT` (`view`), `FINANCIAL_MANAGER` (`view`).
- **Data Source**:
  - `arService.records({ pageSize: 100 })` -> `GET /accounts-receivable/records`
  - `arService.aging()` -> `GET /accounts-receivable/aging`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
- **Interactive Controls**:
  - **View Mode Switcher** (`By Invoices` / `By Clients`): Toggles grouped card display.
  - **Search Input**: Filters records by client name, invoice number, or status.
  - **Aging Bracket Dropdown**: Filters by `All`, `0-30 days`, `31-60 days`, `61-90 days`, `90+ days`.
  - **Status Filter Dropdown**: Filters by `All`, `Current`, `Overdue`, `Paid`.
  - **"View Client" Button**: Navigates to `/clients/:id`.
  - **"Record Payment" Button**: Navigates to `/payments?invoiceId=:id`.
  - **Priority Action / Notice Button**: Opens collection notice generator.
- **States**:
  - **Loading**: Shows loading state for KPIs and AR record list.
  - **Error**: Renders fallback notice.
  - **Empty**: Displays "No accounts receivable records match the current criteria."
  - **403**: Handled by `<RoleGuard module="accountsReceivable">`.

---

### 7. Payments
- **Route**: `/payments` (Detail: `/payments/:id`)
- **Allowed Roles**: `ACCOUNTANT` (`view`, `create`, `edit`, `submit`), `HEAD_ACCOUNTANT` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `paymentsService.list({ pageSize: 100 })` -> `GET /payments`
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
  - `cashFlowService.list({ pageSize: 100 })` -> `GET /cash-flow`
- **Interactive Controls**:
  - **Search Input**: Filters by payment ID, reference number, client, or invoice number.
  - **Payment Method Filter Dropdown**: Filters by `Bank Transfer`, `Check`, `SpeedPay`, `Cash`.
  - **Status Filter Dropdown**: Filters by `Pending Validation`, `Validated`, `Approved`, `Rejected`.
  - **Date Range Pickers** (`filterDateFrom`, `filterDateTo`): Scopes payment recording dates.
  - **Payment Card "Approve" Button** (for FM on `Validated` records): Calls `paymentsService.update(id, { status: 'Approved' })` and logs audit entry.
  - **Payment Card "Return for Review" Button**: Prompts for rejection reason and calls `paymentsService.update(id, { status: 'Returned', notes: reason })`.
  - **Payment Card "View Details" Button**: Opens Payment Details modal.
  - **Payment Details Modal Close Button**: Dismisses modal.
- **States**:
  - **Loading**: Renders loading cards.
  - **Error**: Renders `<PaymentsErrorBoundary>` if component encounters an unhandled exception.
  - **Empty**: Displays "No payments found matching the selected filters."
  - **403**: Handled by `<RoleGuard module="payments">`.

---

### 8. SpeedPay Validation
- **Route**: `/speedpay-validation` (Detail: `/speedpay-validation/:id`)
- **Allowed Roles**: `ACCOUNTANT` (`view`), `HEAD_ACCOUNTANT` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `speedpayService.list({ pageSize: 100 })` -> `GET /speedpay/submissions`
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
- **Interactive Controls**:
  - **Search Input**: Filters submissions by transaction ID, invoice number, or client name.
  - **Payment Method Filter Dropdown**: Filters by GCash, Maya, Bank Transfer.
  - **Status Filter Dropdown**: Filters by `Pending Validation`, `Validated`, `Rejected`.
  - **Date Pickers** (`dateFrom`, `dateTo`): Scopes submission timestamps.
  - **Submission Card "Review Submission" / "View Details" Button**: Opens validation modal.
  - **Validation Modal Decision Options** (`Approve`, `Reject`, `Return`): Selects validation action.
  - **Validation Modal Reason Field**: Mandatory when Reject or Return is chosen.
  - **Validation Modal "Submit Validation" Button**: Calls `speedpayService.validate(id, { status, notes })`, updates invoice to `Paid` if approved, and prompts pre-check duplicate alerts if applicable.
  - **Proof Image Controls** (`Zoom In`, `Zoom Out`, `Reset`): Manipulates uploaded receipt image.
  - **Modal Close ("X")**: Dismisses modal.
- **States**:
  - **Loading**: Shows `<LoadingSpinner text="Loading SpeedPay submissions..." />`.
  - **Error**: Displays toast error message.
  - **Empty**: Displays "No SpeedPay submissions found."
  - **403**: Handled by `<RoleGuard module="speedpayValidation">`.

---

### 9. Official Receipts
- **Route**: `/receipts` (Detail: `/receipts/:id`)
- **Allowed Roles**: `ACCOUNTANT` (`view`, `create`), `FINANCIAL_MANAGER` (`view`).
- **Data Source**:
  - `paymentsService.receipts.list({ pageSize: 100 })` -> `GET /payments/receipts`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `paymentsService.list({ pageSize: 100 })` -> `GET /payments`
  - `speedpayService.list({ pageSize: 100 })` -> `GET /speedpay/submissions`
- **Interactive Controls**:
  - **Search Input**: Filters receipts by receipt number, reference number, client, or invoice.
  - **Receipt Card / Row "View OR" Button**: Opens the Official Receipt modal populated with BIR-compliant fields.
  - **Receipt Modal "Print / Save PDF" Button**: Invokes `html2pdf.js` to render and download official PDF receipt.
  - **Receipt Modal Close Button**: Closes the receipt preview modal.
- **States**:
  - **Loading**: Renders skeleton table.
  - **Error**: Displays toast error notification.
  - **Empty**: Displays "No official receipts issued yet."
  - **403**: Handled by `<RoleGuard module="receipts">`.

---

### 10. Settlement Validation
- **Route**: `/settlements`
- **Allowed Roles**: `ACCOUNTANT` (`view`), `HEAD_ACCOUNTANT` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `settlementsService.list({ pageSize: 100 })` -> `GET /settlements`
- **Interactive Controls**:
  - **Filter Tabs** (`All`, `Pending`, `Validated`, `Rejected`): Quick-filters settlement status.
  - **Search Input**: Filters by settlement ID, courier name, or trip reference.
  - **Type Filter Dropdown**: Filters by `Leftover return`, `Expense liquidation`, `Reimbursement`.
  - **Date Range Pickers** (`dateFrom`, `dateTo`): Scopes submission date.
  - **Settlement Card "Review" Button**: Opens the settlement validation modal.
  - **Modal Decision Radios** (`Approve`, `Reject`): Chooses validation action.
  - **Modal Reason / Remarks Textarea**: Mandatory if rejecting.
  - **Modal "Confirm Decision" Button**: Calls `settlementsService.update(id, { status })` and automatically creates corresponding cash flow record in treasury (`cashFlowService.create`).
  - **Modal Close Button**: Dismisses modal.
- **States**:
  - **Loading**: Renders `<LoadingSpinner text="Loading settlements..." />`.
  - **Error**: Shows toast error message with server response.
  - **Empty**: Displays "No settlement records found."
  - **403**: Handled by `<RoleGuard module="settlements">`.

---

### 11. Record Settlement
- **Route**: `/record-settlement`
- **Allowed Roles**: `ACCOUNTANT` (`view`, `create`, `submit`), `HEAD_ACCOUNTANT` (`view`), `FINANCIAL_MANAGER` (`view`).
- **Data Source**:
  - `settlementsService.list({ pageSize: 100 })` -> `GET /settlements`
- **Interactive Controls**:
  - **Search Input**: Searches by ID, courier, or trip ref.
  - **Status Filter Dropdown**: Filter by `All Statuses`, `For validation`, `Validated`, `Rejected`.
  - **Type Filter Dropdown**: Filter by `All Types`, `Leftover return`, `Expense liquidation`, `Reimbursement`.
  - **Date Range Pickers** (`filterDateFrom`, `filterDateTo`): Scopes submission dates.
  - **"Record Settlement" Button**: Opens `RecordSettlementModal`.
  - **Record Settlement Modal Form**:
    - Courier Name, Trip Reference, Settlement Type, Settlement Amount, Notes, File upload.
    - **"Submit Settlement" Button**: Calls `settlementsService.create(...)`.
    - **"Cancel" Button**: Closes modal.
  - **Settlement Card "Review" / "View" Button**: Opens record details.
- **States**:
  - **Loading**: Shows loading indicator.
  - **Error**: Displays error alert.
  - **Empty**: Displays "No settlement records match your filters."
  - **403**: Handled by `<RoleGuard module="recordSettlement">`.

---

### 12. Adjustment Approval
- **Route**: `/adjustments`
- **Allowed Roles**: `ACCOUNTANT` (`view`, `create`, `edit`, `submit`), `HEAD_ACCOUNTANT` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `adjustmentsService.list({ pageSize: 100 })` -> `GET /adjustments`
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `arService.records({ pageSize: 100 })` -> `GET /accounts-receivable/records`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
- **Interactive Controls**:
  - **Search Input**: Filters adjustments by ID, client, reason, or reference number.
  - **Status Filter Dropdown**: Filters by `All`, `Draft`, `Pending Approval`, `Approved`, `Rejected`.
  - **Type Filter Dropdown**: Filters by `Adjustment`, `Credit Memo`.
  - **Date Range Pickers** (`fromDate`, `toDate`): Scopes creation dates.
  - **"Record Adjustment" Button**: Opens modal to create a new adjustment.
  - **Adjustment Card "Approve" Button** (for `Pending Approval` items): Calls `adjustmentsService.act(id, 'approve')`. If linked invoice is paid, automatically logs refund cash outflow via `cashFlowService.create(...)`.
  - **Adjustment Card "Reject" Button**: Calls `adjustmentsService.act(id, 'reject')`.
  - **Adjustment Card "View Details" Button**: Opens adjustment detail view modal.
  - **Credit Memo "Download PDF" Button**: Generates BIR credit memo PDF via `jsPDF`.
- **States**:
  - **Loading**: Shows loading skeleton cards.
  - **Error**: Shows toast error notification.
  - **Empty**: Displays "No financial adjustments found."
  - **403**: Handled by `<RoleGuard module="adjustments">`.

---

### 13. Liquidation Reports
- **Route**: `/liquidations` (Detail: `/liquidations/:id`)
- **Allowed Roles**: `ASSISTANT_FM` (`view`, `verify`, `return`), `FINANCIAL_MANAGER` (`view`, `approve`, `reject`).
- **Data Source**:
  - `liquidationsService.list({ pageSize: 100 })` -> `GET /liquidations`
- **Interactive Controls**:
  - **Search Input**: Filters by liquidation ID, reference code, or submitter name.
  - **Status Filter Dropdown**: Filters by `Pending Validation`, `Validated`, `Returned`.
  - **Date Range Pickers** (`fromDate`, `toDate`): Filters submission date range.
  - **Liquidation Card "REVIEW" Button**: Opens validation decision modal.
  - **Validation Decision Radio**: Selects between "Validate Liquidation" and "Return for Revision".
  - **Remarks Textarea**: Remarks for the submitter (mandatory on return).
  - **"Confirm Decision" Button**: Calls `liquidationsService.update(id, { status, remarks })`, writes cash outflow via `cashFlowService.create(...)` upon approval, and logs audit record.
  - **Pagination Buttons** (`Previous`, `Next`): Paginate results (9 items per page).
- **States**:
  - **Loading**: Shows loading skeleton.
  - **Error**: Displays toast error message.
  - **Empty**: Displays "No liquidation reports found matching your criteria."
  - **403**: Handled by `<RoleGuard module="liquidations">`.

---

### 14. Cash Flow
- **Route**: `/cash-flow`
- **Allowed Roles**: `FINANCIAL_MANAGER` (`view`, `create`, `approve`, `reject`).
- **Data Source**:
  - `cashFlowService.list({ pageSize: 100 })` -> `GET /cash-flow`
  - `paymentsService.list({ pageSize: 100 })` -> `GET /payments`
  - `liquidationsService.list({ pageSize: 100 })` -> `GET /liquidations`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
- **Interactive Controls**:
  - **Search Input**: Searches transaction ID, reference, or category.
  - **Type Filter Dropdown**: Filter by `All`, `Inflow`, `Outflow`.
  - **Date Range Pickers** (`filterDateFrom`, `filterDateTo`): Filter by transaction date.
  - **Unrecorded Transactions "Record Inflow" Button**: Converts validated payment into cash flow entry via `cashFlowService.create(...)`.
  - **Unrecorded Transactions "Record Outflow" Button**: Converts validated liquidation into cash flow entry via `cashFlowService.create(...)`.
  - **Transaction Card "View Details" Button**: Opens full transaction audit modal.
  - **Details Modal Close Button**: Dismisses modal.
  - **Pagination Buttons** (`Previous`, `Next`): Navigates through cash flow records.
- **States**:
  - **Loading**: Shows loading spinner.
  - **Error**: Shows toast error message.
  - **Empty**: Displays "No cash flow transactions recorded."
  - **403**: Handled by `<RoleGuard module="cashFlow">`.

---

### 15. Unique Documents
- **Route**: `/unique-documents`
- **Allowed Roles**: `FINANCIAL_MANAGER` (`view` - all), `HEAD_ACCOUNTANT` (`view` - all), `ACCOUNTANT` (`view` - dept), `ASSISTANT_FM` (`view` - dept).
- **Data Source**:
  - `duplicatesService.uniqueDocuments({ pageSize, page, search, docType, dateFrom, scope: 'all' })` -> `GET /duplicates/unique`
- **Interactive Controls**:
  - **Search Input**: Filters by document ID, invoice number, or client name.
  - **Document Type Dropdown**: Filters by `All Document Types`, `Invoices`, `Official Receipts`, `Liquidation Vouchers`.
  - **Date Filter Input**: Scopes document upload/scan dates.
  - **"Filter" Button**: Triggers `applyFilters()`.
  - **"Reset" Button**: Clears filters via `resetFilters()`.
  - **Document Card "View Full Document" / "View Details" Button**: Opens Document Detail Modal showing SHA-256 OCR hash, metadata, and extracted entities.
  - **Modal Close Button**: Dismisses modal.
  - **Pagination Buttons** (`Previous`, `Next`): Pages through unique documents.
- **States**:
  - **Loading**: Shows loading skeleton cards.
  - **Error**: Renders `<ErrorState />` with retry button.
  - **Empty**: Displays "No unique documents found matching your criteria."
  - **403**: Handled by `<RoleGuard module="uniqueDocuments">`.

---

### 16. Flagged Duplicates
- **Route**: `/flagged-duplicates`
- **Allowed Roles**: `FINANCIAL_MANAGER` (`view`, `approve`, `return`), `HEAD_ACCOUNTANT` (`view`, `approve`, `return`), `ACCOUNTANT` (`view`, `submit`), `ASSISTANT_FM` (`view`, `submit`).
- **Data Source**:
  - `duplicatesService.flagged({ pageSize, page, search, status, dateFrom, scope: 'all' })` -> `GET /duplicates/flagged`
- **Interactive Controls**:
  - **Search Input**: Matches flag ID, invoice number, reference, or reason.
  - **Status Filter Dropdown**: Filter by `ALL`, `PENDING_REVIEW`, `CONFIRMED_DUPLICATE`, `DISMISSED`, `RESOLVED`.
  - **Date Filter Input**: Filter by detection timestamp.
  - **"Filter" & "Reset" Buttons**: Applies and clears search parameters.
  - **Flag Card "Compare & Review" Button**: Opens `DuplicateReviewPanel` side-by-side comparison modal.
  - **Flag Card "Quick Inspect" Button**: Opens quick inspect popup.
  - **Supervisor Action Buttons**:
    - **"Approve" Button**: Opens confirmation modal with remarks; calls `duplicatesService.reviewDecision(id, { action: 'APPROVE', remarks, reviewer })`. Enforces separation of duties (cannot approve own decision).
    - **"Return" Button**: Opens confirmation modal requiring remarks; calls `duplicatesService.reviewDecision(id, { action: 'RETURN', remarks, reviewer })`.
  - **Pagination Buttons** (`Previous`, `Next`): Pages through duplicate flags.
- **States**:
  - **Loading**: Shows loading spinner.
  - **Error**: Displays error state with retry.
  - **Empty**: Displays "No duplicate alerts currently flagged."
  - **403**: Handled by `<RoleGuard module="flaggedDuplicates">`.

---

### 17. Review History
- **Route**: `/review-history`
- **Allowed Roles**: `FINANCIAL_MANAGER` (`view`, `export`), `HEAD_ACCOUNTANT` (`view`, `export`), `ACCOUNTANT` (`view`, `export`), `ASSISTANT_FM` (`view`, `export`).
- **Data Source**:
  - `duplicatesService.reviewHistory({ pageSize, page, search, decision, dateFrom, scope: 'all' })` -> `GET /duplicates/history`
- **Interactive Controls**:
  - **"Export All CSV" Button**: Generates and downloads a CSV export of all audit entries.
  - **Decision Filter Tabs** (`All`, `Confirmed Duplicate`, `Dismissed`, `Resolved`): Quick-filters decision categories with counts.
  - **Search Input**: Filters by history ID, document number, client, or reviewer.
  - **Date Filter Input**: Filters by review date.
  - **"Filter" & "Reset" Buttons**: Executes search and resets parameters.
  - **History Card "Audit Log" / "View Details" Button**: Opens Record Details modal.
  - **Record Details Modal Close Button**: Closes modal.
  - **Pagination Buttons** (`Previous`, `Next`): Pages through history.
- **States**:
  - **Loading**: Shows loading spinner.
  - **Error**: Shows error state with retry.
  - **Empty**: Displays "No review history entries found."
  - **403**: Handled by `<RoleGuard module="reviewHistory">`.

---

### 18. Reports
- **Route**: `/reports` (Detail: `/reports/:id`)
- **Allowed Roles**: `ACCOUNTANT` (`view`, `export`), `HEAD_ACCOUNTANT` (`view`, `export`), `FINANCIAL_MANAGER` (`view`, `export`), `ASSISTANT_FM` (`view`, `export`).
- **Data Source**:
  - `invoicesService.list({ pageSize: 100 })` -> `GET /invoices`
  - `clientsService.list({ pageSize: 100 })` -> `GET /clients`
  - `arService.records({ pageSize: 100 })` -> `GET /accounts-receivable/records`
  - `paymentsService.list({ pageSize: 100 })` -> `GET /payments`
  - `duplicatesService.flagged({ pageSize: 100 })` -> `GET /duplicates/flagged`
  - `duplicatesService.uniqueDocuments({ pageSize: 100 })` -> `GET /duplicates/unique`
  - `duplicatesService.reviewHistory({ pageSize: 100 })` -> `GET /duplicates/history`
- **Interactive Controls**:
  - **Ledger Type Dropdown**: Selects `Aging of Accounts`, `Invoice Summary`, `Collection Summary`, `Duplicate Alert Summary`, `Unique Document Ledger`, or `Review History Audit`.
  - **Date Range Dropdown**: Selects `All Time`, `Last 7 Days`, `Last 30 Days`, `Last 90 Days`, `This Month`, `This Year`.
  - **Search Input**: Filter report records in view.
  - **"Generate Report" Button**: Compiles ledger data, updates visualization charts, and creates an audit log entry via `auditLogsService.create`.
  - **"Export PDF" Button**: Generates a professional multi-page executive financial statement using `jspdf` and `jspdf-autotable`.
  - **"Export CSV" Button**: Exports raw tabular report data as CSV.
- **States**:
  - **Loading**: Shows loading placeholder.
  - **Error**: Caught by `<ErrorBoundary>` with stack trace display.
  - **Empty**: Displays empty report table with zeroed totals.
  - **403**: Handled by `<RoleGuard module="reports">`.

---

### 19. Audit Logs
- **Route**: `/audit-logs`
- **Allowed Roles**: `HEAD_ACCOUNTANT` (`view`), `FINANCIAL_MANAGER` (`view`, `export`).
- **Data Source**:
  - `auditLogsService.list({ pageSize: 200 })` -> `GET /audit-logs`
- **Interactive Controls**:
  - **Search Input**: Searches user name, role, action, or details with recent search history popover.
  - **Event Type Filter Dropdown**: Filter by specific action (e.g., `DOCUMENT_UPLOADED`, `INVOICE_CREATED`, `PAYMENT_PROCESSED`).
  - **Result Filter Dropdown**: Filter by `All Results`, `Success`, `Failed`.
  - **User Filter Dropdown**: Filter by user full name.
  - **Date Range Pickers** (`dateFrom`, `dateTo`): Scopes event timestamps.
  - **"Export Log" Button**: Downloads a CSV of filtered audit events.
  - **Row Action Menu ("...")**: Opens dropdown menu.
  - **"View Details" Button**: Opens detailed JSON/metadata modal of the audit entry.
  - **Log Detail Modal Close Button**: Dismisses modal.
  - **Rows Per Page Selector & Page Controls**: Changes page size (10, 25, 50) and current page.
- **States**:
  - **Loading**: Displays table loading state.
  - **Error**: Shows toast error notification.
  - **Empty**: Displays "No audit log records match the selected criteria."
  - **403**: Handled by `<RoleGuard module="auditLogs">`.

---

### 20. AI Output History
- **Route**: `/ai-history`
- **Allowed Roles**: `FINANCIAL_MANAGER` (`view`, `export`), `HEAD_ACCOUNTANT` (`view`, `export`), `ACCOUNTANT` (`view`, `export`), `ASSISTANT_FM` (`view`, `export`).
- **Data Source**:
  - `aiOutputsService.list({ page, pageSize, search, module, dateFrom, scope: 'all' })` -> `GET /ai/history`
- **Interactive Controls**:
  - **Search Input**: Searches output ID, document number, client name, or summary.
  - **AI Module Dropdown**: Filters by `Duplicate Detection`, `Receivable Risk`, `Collection Forecasting`, `Document Extraction`.
  - **Date Recorded Input**: Filters by timestamp.
  - **"Apply Filters" Button**: Triggers `fetchRecords()`.
  - **"Reset Filters" Button**: Clears all filter parameters.
  - **"Export CSV" Button**: Generates and downloads a CSV of AI intelligence records.
  - **Record Card "View Details" Button**: Opens output summary and model confidence score breakdown.
  - **Pagination Buttons** (`Previous`, `Next`): Pages through output records.
- **States**:
  - **Loading**: Shows loading indicator.
  - **Error**: Handled by `<AiErrorBoundary>` with retry.
  - **Empty**: Displays "No AI output history records found."
  - **403**: Handled by `<RoleGuard module="aiHistory">`.

---

## Step 3: Forbidden Pages (403 Verification)

When `EMP-001` attempts to navigate to pages reserved for operational staff:

1. **Duplicate Scan (`/duplicate-scan`)**
   - Configured in `MODULES`: Allowed only for `ACCOUNTANT` and `ASSISTANT_FM`.
   - Result: `<RoleGuard module="duplicateScan">` blocks access and renders `<ForbiddenPage />` ("403 — Access denied. Your role does not have permission to view this page.").
   - Recovery: "Go to my dashboard" button routes back to `/dashboard`.

2. **Document Extraction (`/document-extraction`)**
   - Configured in `MODULES`: Allowed only for `ACCOUNTANT` and `ASSISTANT_FM`.
   - Result: `<RoleGuard module="documentExtraction">` blocks access and renders `<ForbiddenPage />`.
   - Recovery: "Go to my dashboard" button routes back to `/dashboard`.

---

## Step 4: Cross-Role Handoffs

```
                      ┌────────────────────────────────────────────────────────┐
                      │              FINANCIAL MANAGER (EMP-001)               │
                      │   Executive Review · Rate Governance · Final Approval   │
                      └───────────────────────────┬────────────────────────────┘
                                                  │
          ┌───────────────────────────────────────┼────────────────────────────────────────┐
          │                                       │                                        │
          ▼                                       ▼                                        ▼
┌─────────────────────────┐             ┌─────────────────────────┐              ┌─────────────────────────┐
│     HEAD ACCOUNTANT     │             │       ACCOUNTANT        │              │      ASSISTANT FM       │
│  Supervisory Validation │             │ Operations & Recording  │              │  Disbursements & Fleets │
└─────────────────────────┘             └─────────────────────────┘              └─────────────────────────┘
```

### 1. Interactions with Head Accountant (HA)
- **What EMP-001 receives from HA**:
  - Invoices verified by HA in `/billing-validation` and `/invoice-review` with status `Pending Approval`.
  - Validated payments from `/payments` and `/speedpay-validation`.
  - Endorsed financial adjustments and credit memos from `/adjustments`.
  - Level 2 duplicate detection reviews from `/flagged-duplicates`.
- **What EMP-001 sends to HA**:
  - Approved invoices ready for official release and sending.
  - Returned invoices with specific revision remarks (sets status to `Needs Revision`).
  - Approved or rejected adjustments with financial notes.
  - Final resolution on flagged duplicates (`CONFIRMED_DUPLICATE` or `DISMISSED`).

### 2. Interactions with Accountant (ACC)
- **What EMP-001 receives from ACC**:
  - Client profile creations and accounts from `/clients`.
  - Waybill billing calculations from `/billing-validation`.
  - Draft and submitted invoices from `/invoicing-desk`.
  - Settlement entries recorded from courier cash returns in `/record-settlement`.
  - SpeedPay proof-of-payment submissions.
- **What EMP-001 sends to ACC**:
  - Rejection notices and returned invoices requiring billing or waybill corrections.
  - Rate configurations and billing approvals that unlock invoice generation.
  - Visibility into executive AR aging metrics and collection targets.

### 3. Interactions with Assistant FM (AFM)
- **What EMP-001 receives from AFM**:
  - Field courier and travel liquidation reports verified by AFM in `/liquidations`.
  - Endorsed SpeedPay validations for logistics and cash settlements in `/speedpay-validation`.
  - Courier trip settlement submissions in `/settlements`.
- **What EMP-001 sends to AFM**:
  - Returned liquidation reports requiring additional vendor receipts or trip logs.
  - Approved liquidations which automatically trigger cash outflow entries in Treasury `/cash-flow`.

---

## Step 5: User Profile & Logout Flow

1. **User Profile**:
   - Route: `/profile`
   - Reachable via: Clicking user profile card at the bottom of the sidebar and selecting "My Profile".
   - Displays: Employee ID (`EMP-001`), Full Name (`Crystalyn Joyce C. Fajardo`), Role (`Financial Manager`), Email (`finance.manager@speedex.test`).

2. **Logout**:
   - Trigger: Clicking the user profile card in the bottom-left of the sidebar to open the menu, then clicking the red **Log Out** button (`ti ti-logout`).
   - Execution:
     1. Calls `logout()` in `AuthContext.tsx`.
     2. Clears JWT token from `localStorage` and `sessionStorage`.
     3. Clears in-memory authenticated user state.
     4. Sets `sessionStorage.setItem('loggedOut', 'true')`.
     5. `<ProtectedRoute>` catches unauthenticated state and redirects to `/login` with clean state.
