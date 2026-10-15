// Single status-to-actions permission matrix governing duplicate detection lifecycle
export type DuplicateWorkflowStatus =
  | 'PENDING_SCAN'
  | 'SCANNED'
  | 'UNDER_MANUAL_REVIEW'
  | 'RETURNED'
  | 'UNIQUE'
  | 'FLAGGED';

export type UserWorkflowRole = 'ACCOUNTANT' | 'FINANCE_MANAGER';

export type AllowedAction =
  | 'SCAN'
  | 'MARK_UNIQUE'
  | 'FLAG_DUPLICATE'
  | 'SEND_MANUAL_REVIEW'
  | 'CONFIRM_UNIQUE'
  | 'CONFIRM_DUPLICATE'
  | 'RETURN_TO_ACCOUNTANT'
  | 'RESUBMIT'
  | 'VIEW_ONLY';

export const STATUS_ACTION_MAP: Record<DuplicateWorkflowStatus, Record<UserWorkflowRole, AllowedAction[]>> = {
  PENDING_SCAN: {
    ACCOUNTANT: ['SCAN'],
    FINANCE_MANAGER: ['VIEW_ONLY'],
  },
  SCANNED: {
    ACCOUNTANT: ['MARK_UNIQUE', 'FLAG_DUPLICATE', 'SEND_MANUAL_REVIEW'],
    FINANCE_MANAGER: ['VIEW_ONLY'],
  },
  UNDER_MANUAL_REVIEW: {
    ACCOUNTANT: ['VIEW_ONLY'],
    FINANCE_MANAGER: ['CONFIRM_UNIQUE', 'CONFIRM_DUPLICATE', 'RETURN_TO_ACCOUNTANT'],
  },
  RETURNED: {
    ACCOUNTANT: ['RESUBMIT', 'SEND_MANUAL_REVIEW'],
    FINANCE_MANAGER: ['VIEW_ONLY'],
  },
  UNIQUE: {
    ACCOUNTANT: ['VIEW_ONLY'],
    FINANCE_MANAGER: ['VIEW_ONLY'],
  },
  FLAGGED: {
    ACCOUNTANT: ['VIEW_ONLY'],
    FINANCE_MANAGER: ['VIEW_ONLY'],
  },
};

export const canPerformAction = (
  status: DuplicateWorkflowStatus,
  role: UserWorkflowRole,
  action: AllowedAction
): boolean => {
  const allowed = STATUS_ACTION_MAP[status]?.[role] || [];
  return allowed.includes(action);
};
