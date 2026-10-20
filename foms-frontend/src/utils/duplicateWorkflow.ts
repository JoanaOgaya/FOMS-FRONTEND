/**
 * src/utils/duplicateWorkflow.ts
 *
 * Single source of truth for the Two-Level AI Duplicate Approval Workflow:
 *   Level 1: ACCOUNTANT makes the duplicate decision.
 *            (Assistant FM for liquidation documents)
 *   Level 2: HEAD ACCOUNTANT reviews that decision and approves/returns it.
 *            (Financial Manager for liquidation documents)
 *
 * Status Flow:
 *   FLAGGED
 *     -> Level 1 Action:
 *          "Mark as Duplicate"     -> PENDING_REVIEW (decision: DUPLICATE)
 *          "Mark as Not Duplicate" -> PENDING_REVIEW (decision: NOT_DUPLICATE)
 *        (Remarks required for both)
 *     -> Level 2 Action (on PENDING_REVIEW):
 *          "Approve" -> APPROVED_DUPLICATE (if decision == DUPLICATE)
 *                       or CLEARED_NOT_DUPLICATE (if decision == NOT_DUPLICATE)
 *          "Return"  -> RETURNED to Level 1 (remarks required)
 *   RETURNED
 *     -> Level 1 decides again (with remarks) -> PENDING_REVIEW
 *
 * The frontend only decides which buttons to SHOW. The API performs the transition and
 * returns the new status; official records change only after Level 2 approval.
 */

import { ROLES, type Role } from '../types/auth';
import { isLiquidationDoc } from './roleAccess';

export const DUPLICATE_STATUSES = [
  'FLAGGED',
  'PENDING_REVIEW',
  'RETURNED',
  'APPROVED_DUPLICATE',
  'CLEARED_NOT_DUPLICATE',
] as const;

export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export type Level1Decision = 'DUPLICATE' | 'NOT_DUPLICATE';
export type Level2Action = 'APPROVE' | 'RETURN';

export type DuplicateActionType = 'mark_duplicate' | 'mark_not_duplicate' | 'approve' | 'return';

export const DUPLICATE_STATUS_LABELS: Record<DuplicateStatus, string> = {
  FLAGGED: 'Flagged (AI Match)',
  PENDING_REVIEW: 'Pending Review',
  RETURNED: 'Returned',
  APPROVED_DUPLICATE: 'Approved Duplicate',
  CLEARED_NOT_DUPLICATE: 'Cleared (Not Duplicate)',
};

export const DUPLICATE_STATUS_TONES: Record<DuplicateStatus, 'warning' | 'info' | 'danger' | 'success' | 'neutral'> = {
  FLAGGED: 'warning',
  PENDING_REVIEW: 'info',
  RETURNED: 'warning',
  APPROVED_DUPLICATE: 'danger',
  CLEARED_NOT_DUPLICATE: 'success',
};

export const DECISION_LABELS: Record<Level1Decision, string> = {
  DUPLICATE: 'Marked as Duplicate',
  NOT_DUPLICATE: 'Marked as Not Duplicate',
};

export interface DuplicateActionDef {
  action: DuplicateActionType;
  label: string;
  level: 1 | 2;
  /** Statuses on which the action is offered. */
  from: readonly DuplicateStatus[];
  /** Resulting status (approve depends on the Level 1 decision). */
  to: DuplicateStatus | ((decision?: Level1Decision | null) => DuplicateStatus);
  remarksRequired: boolean;
}

/** The workflow table. Pages render buttons from this; nothing else defines transitions. */
export const DUPLICATE_ACTIONS: readonly DuplicateActionDef[] = [
  { action: 'mark_duplicate', label: 'Mark as Duplicate', level: 1, from: ['FLAGGED', 'RETURNED'], to: 'PENDING_REVIEW', remarksRequired: true },
  { action: 'mark_not_duplicate', label: 'Mark as Not Duplicate', level: 1, from: ['FLAGGED', 'RETURNED'], to: 'PENDING_REVIEW', remarksRequired: true },
  { action: 'approve', label: 'Approve', level: 2, from: ['PENDING_REVIEW'], to: (d) => (d === 'NOT_DUPLICATE' ? 'CLEARED_NOT_DUPLICATE' : 'APPROVED_DUPLICATE'), remarksRequired: false },
  { action: 'return', label: 'Return', level: 2, from: ['PENDING_REVIEW'], to: 'RETURNED', remarksRequired: true },
];

export function getDuplicateAction(action: DuplicateActionType): DuplicateActionDef {
  const def = DUPLICATE_ACTIONS.find((a) => a.action === action);
  if (!def) throw new Error(`Unknown duplicate action: ${action}`);
  return def;
}

/** Which role acts at which level, per document class. */
export const LEVEL_ROLES: Record<'standard' | 'liquidation', Record<1 | 2, Role>> = {
  standard: { 1: ROLES.ACCOUNTANT, 2: ROLES.HEAD_ACCOUNTANT },
  liquidation: { 1: ROLES.ASSISTANT_FM, 2: ROLES.FINANCIAL_MANAGER },
};

/**
 * Accepts API status in any casing (and legacy spellings) and returns the canonical status.
 * Unknown values return null so no action button is ever offered for them.
 */
export function normalizeDuplicateStatus(raw: string | null | undefined): DuplicateStatus | null {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if ((DUPLICATE_STATUSES as readonly string[]).includes(s)) return s as DuplicateStatus;
  if (s === 'FOR_REVIEW' || s === 'PENDING') return 'PENDING_REVIEW';
  if (s === 'RETURN') return 'RETURNED';
  if (s === 'CONFIRMED_DUPLICATE') return 'APPROVED_DUPLICATE';
  if (s === 'NOT_DUPLICATE' || s === 'DISMISSED') return 'CLEARED_NOT_DUPLICATE';
  return null;
}

/** Can this role perform this action on a record with this status / document type? */
export function canPerformDuplicateAction(
  action: DuplicateActionType,
  recordStatus: string | null | undefined,
  role: Role | null | undefined,
  documentType?: string | null,
): boolean {
  if (!role) return false;
  const current = normalizeDuplicateStatus(recordStatus);
  if (!current) return false;
  const def = getDuplicateAction(action);
  if (!def.from.includes(current)) return false;
  const docClass = isLiquidationDoc(documentType) ? 'liquidation' : 'standard';
  return LEVEL_ROLES[docClass][def.level] === role;
}

/** Level 1 ("Mark as Duplicate" / "Mark as Not Duplicate") on FLAGGED or RETURNED. */
export function canDecideDuplicate(role: Role | null | undefined, status: string | null | undefined, documentType?: string | null): boolean {
  return canPerformDuplicateAction('mark_duplicate', status, role, documentType);
}

/** Level 2 ("Approve" / "Return") on PENDING_REVIEW. */
export function canReviewDuplicate(role: Role | null | undefined, status: string | null | undefined, documentType?: string | null): boolean {
  return canPerformDuplicateAction('approve', status, role, documentType);
}

export const SELF_APPROVAL_MESSAGE = 'You cannot approve your own decision';

/** Separation of duties: nobody approves their own decision (decision.decidedBy === current user id). */
export function canApproveOwnCheck(
  currentUserId: string | null | undefined,
  decidedBy: string | null | undefined,
): { allowed: boolean; reason?: string } {
  if (!currentUserId || !decidedBy) return { allowed: true };
  if (currentUserId.toLowerCase() === decidedBy.toLowerCase()) {
    return { allowed: false, reason: SELF_APPROVAL_MESSAGE };
  }
  return { allowed: true };
}

/** Expected next status (display/tests only; the API response is authoritative). */
export function getNextDuplicateStatus(action: DuplicateActionType, currentDecision?: Level1Decision | null): DuplicateStatus {
  const { to } = getDuplicateAction(action);
  return typeof to === 'function' ? to(currentDecision) : to;
}

/**
 * Status filter sent to GET /ai/duplicates for the role's work queue on Flagged Duplicates.
 *  - Head Accountant: "For Review" queue = PENDING_REVIEW only (locked).
 *  - Others: no lock (Accountant / Asst FM see their scope; FM sees all, acts only on liquidation).
 */
export function lockedQueueStatus(role: Role | null | undefined): DuplicateStatus | undefined {
  return role === ROLES.HEAD_ACCOUNTANT ? 'PENDING_REVIEW' : undefined;
}
