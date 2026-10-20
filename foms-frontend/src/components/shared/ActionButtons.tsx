import React, { useState } from 'react';
import Button, { type ButtonVariant } from '../Buttons';
import { ConfirmModal } from './ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { canDo, type Action, type ModuleKey } from '../../utils/roleAccess';
import { nextActions, type WorkflowKind } from '../../utils/workflow';

const ACTION_META: Record<Exclude<Action, 'view' | 'export' | 'scan'>, { label: string; variant: ButtonVariant; icon: string; confirm?: boolean }> = {
  create: { label: 'Create', variant: 'primary', icon: 'ti-plus' },
  edit: { label: 'Edit', variant: 'secondary', icon: 'ti-edit' },
  submit: { label: 'Submit', variant: 'primary', icon: 'ti-send', confirm: true },
  verify: { label: 'Verify', variant: 'success', icon: 'ti-circle-check', confirm: true },
  return: { label: 'Return', variant: 'warning', icon: 'ti-arrow-back-up', confirm: true },
  approve: { label: 'Approve', variant: 'success', icon: 'ti-checks', confirm: true },
  reject: { label: 'Reject', variant: 'danger', icon: 'ti-circle-x', confirm: true },
};

export interface ActionButtonsProps {
  module: ModuleKey;
  /** Workflow the record follows. */
  kind?: WorkflowKind;
  /** Current record status; actions are shown only when role AND status allow them. */
  status: string;
  /** Called with the chosen action (and remarks for return/reject). */
  onAction: (action: Action, remarks?: string) => void | Promise<unknown>;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/** Role- and status-aware action buttons (Create/Edit/Submit · Verify/Return · Approve/Reject). */
export const ActionButtons: React.FC<ActionButtonsProps> = ({ module, kind = 'standard', status, onAction, disabled, size = 'sm' }) => {
  const { user } = useAuth();
  const [pending, setPending] = useState<Action | null>(null);
  const [remarks, setRemarks] = useState('');

  const allowed = nextActions(kind, status, user?.role).filter(
    (a): a is keyof typeof ACTION_META => a in ACTION_META && canDo(user?.role, module, a),
  );
  if (allowed.length === 0) return null;

  const needsRemarks = (a: Action | null) => a === 'return' || a === 'reject';
  const close = () => { setPending(null); setRemarks(''); };

  return (
    <>
      <div style={{ display: 'inline-flex', gap: 6 }}>
        {allowed.map((a) => (
          <Button
            key={a}
            title={ACTION_META[a].label}
            variant={ACTION_META[a].variant}
            icon={ACTION_META[a].icon}
            size={size}
            disabled={disabled}
            onClick={() => (ACTION_META[a].confirm ? setPending(a) : void onAction(a))}
          />
        ))}
      </div>
      <ConfirmModal
        isOpen={pending !== null}
        title={pending ? `${ACTION_META[pending as keyof typeof ACTION_META].label} this record?` : ''}
        message={needsRemarks(pending) ? 'Add remarks for the submitter.' : 'This action will be recorded in the audit log.'}
        variant={pending === 'reject' ? 'danger' : 'primary'}
        confirmLabel={pending ? ACTION_META[pending as keyof typeof ACTION_META].label : undefined}
        onCancel={close}
        onConfirm={() => {
          if (needsRemarks(pending) && !remarks.trim()) return;
          const chosen = pending;
          close();
          if (chosen) void onAction(chosen, needsRemarks(chosen) ? remarks.trim() : undefined);
        }}
      >
        {needsRemarks(pending) && (
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks (required)"
            aria-label="Remarks"
            style={{ width: '100%', height: 80, padding: 8, borderRadius: 8, border: '1px solid #E2E8F0', boxSizing: 'border-box' }}
          />
        )}
      </ConfirmModal>
    </>
  );
};

export default ActionButtons;
