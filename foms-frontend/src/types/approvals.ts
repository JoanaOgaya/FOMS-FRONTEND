/**
 * Typed contracts for Multi-Level Approval Workflow
 * Payments, Settlements, Financial Adjustments, and Cash Advances
 */

export type ApprovalEntityType = 'Payment' | 'Settlement' | 'FinancialAdjustment' | 'CashAdvance';

export type ApprovalStatus =
  | 'Draft'
  | 'Submitted'
  | 'PendingFinanceManager'
  | 'Approved'
  | 'ReturnedForRevision'
  | 'Returned'
  | 'Rejected';

export interface ApprovalStep {
  level: string | number;
  approverName: string;
  actorName?: string;
  actorRole?: string;
  actorUserId?: string;
  role?: string;
  action: 'Submitted' | 'Approved' | 'ReturnedForRevision' | 'Rejected' | 'Escalated' | string;
  remarks?: string;
  actedAt: string;
}

export interface ApprovalRequest {
  id: string;
  entityType: ApprovalEntityType | string;
  entityId: string;
  referenceNo: string;
  amount: number;
  requestedBy: string;
  requestedById?: string;
  currentLevel: 'AssistantFinanceManager' | 'FinanceManager' | string;
  status: ApprovalStatus;
  createdAt: string;
  updatedAt?: string;
  purpose?: string;
  description?: string;
  isEscalated?: boolean;
  escalationThreshold?: number;
  rejectionReason?: string;
  remarks?: string;
}

export interface ApprovalCounts {
  pendingCount: number;
  pendingMyApproval?: number;
  approvedToday?: number;
  escalatedToFm?: number;
  approvedThisMonth?: number;
}

export interface CashAdvance {
  id: string;
  referenceNo: string;
  amount: number;
  purpose: string;
  dateNeeded: string;
  remarks?: string;
  requestedBy: string;
  requestedById?: string;
  status: ApprovalStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CashAdvanceCreatePayload {
  amount: number;
  purpose: string;
  dateNeeded: string;
  remarks?: string;
}
