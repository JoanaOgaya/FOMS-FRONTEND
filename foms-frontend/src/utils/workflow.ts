/**
 * Workflow config — ONE place for status labels, tones and next-action rules.
 *   Standard   : DRAFT -> SUBMITTED -> VERIFIED | RETURNED -> APPROVED | REJECTED
 *   Liquidation: SUBMITTED -> VALIDATED | RETURNED -> APPROVED
 *   Duplicate  : lives ONLY in ./duplicateWorkflow (FLAGGED -> PENDING_REVIEW -> APPROVED_DUPLICATE |
 *                CLEARED_NOT_DUPLICATE, or RETURNED). This file only re-exports it for labels/tones.
 */
import type { Role } from '../types/auth';
import { ROLES } from '../types/auth';
import type { Action } from './roleAccess';
import {
  DUPLICATE_STATUSES,
  DUPLICATE_STATUS_LABELS,
  DUPLICATE_STATUS_TONES,
  type DuplicateStatus,
} from './duplicateWorkflow';

export type WorkflowKind = 'standard' | 'liquidation';
export type WorkflowStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'VALIDATED'
  | 'RETURNED'
  | 'APPROVED'
  | 'REJECTED'
  | DuplicateStatus;

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral';

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  VALIDATED: 'Validated',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ...DUPLICATE_STATUS_LABELS,
  RETURNED: 'Returned',
};

export const STATUS_TONE: Record<WorkflowStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  VERIFIED: 'primary',
  VALIDATED: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  ...DUPLICATE_STATUS_TONES,
  RETURNED: 'warning',
};

/** status -> role -> actions allowed on a record in that status. */
const NEXT_ACTIONS: Record<WorkflowKind, Partial<Record<WorkflowStatus, Partial<Record<Role, readonly Action[]>>>>> = {
  standard: {
    DRAFT: { [ROLES.ACCOUNTANT]: ['edit', 'submit'] },
    RETURNED: { [ROLES.ACCOUNTANT]: ['edit', 'submit'] },
    SUBMITTED: { [ROLES.HEAD_ACCOUNTANT]: ['verify', 'return'] },
    VERIFIED: { [ROLES.FINANCIAL_MANAGER]: ['approve', 'reject'] },
  },
  liquidation: {
    SUBMITTED: { [ROLES.ASSISTANT_FM]: ['verify', 'return'] },
    VALIDATED: { [ROLES.FINANCIAL_MANAGER]: ['approve', 'reject'] },
  },
};

/** Actions this role may take on a record in this status (before module-level permission is applied). */
export function nextActions(kind: WorkflowKind, status: string, role: Role | null | undefined): readonly Action[] {
  if (!role) return [];
  return NEXT_ACTIONS[kind][normalizeStatus(status)]?.[role] ?? [];
}

const KNOWN = new Set<string>([...Object.keys(STATUS_LABEL), ...DUPLICATE_STATUSES]);

/** Accepts API status text in any casing/spelling and returns canonical status (unknown values pass through). */
export function normalizeStatus(raw: string | null | undefined): WorkflowStatus {
  const s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  return (s || 'DRAFT') as WorkflowStatus;
}

export function isKnownStatus(raw: string | null | undefined): boolean {
  return KNOWN.has(normalizeStatus(raw));
}

export {
  normalizeDuplicateStatus,
  canPerformDuplicateAction,
  canDecideDuplicate,
  canReviewDuplicate,
  canApproveOwnCheck,
  getNextDuplicateStatus,
  DUPLICATE_STATUSES,
  DUPLICATE_STATUS_LABELS,
  DUPLICATE_STATUS_TONES,
  type DuplicateStatus,
  type Level1Decision,
  type Level2Action,
} from './duplicateWorkflow';

/** Workflow label for a known status; unknown API values are shown verbatim (never crash). */
export function statusLabel(raw: string | null | undefined): string {
  const key = normalizeStatus(raw);
  return STATUS_LABEL[key] ?? String(raw ?? '');
}
