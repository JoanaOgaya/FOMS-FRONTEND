/**
 * invalidation.ts — Centralized mutation-to-query invalidation rules.
 * When data changes anywhere, every FM page and cross-role flow that shows it
 * must be refetched by invalidating the matching query key prefixes.
 */
import { invalidateQueries } from '../hooks/useQuery';

export type MutationType =
  | 'approveInvoice'
  | 'rejectInvoice'
  | 'submitInvoice'
  | 'approvePayment'
  | 'recordPayment'
  | 'rejectPayment'
  | 'approveSettlement'
  | 'recordSettlement'
  | 'rejectSettlement'
  | 'approveAdjustment'
  | 'recordAdjustment'
  | 'rejectAdjustment'
  | 'validateSpeedpay'
  | 'rejectSpeedpay'
  | 'approveLiquidation'
  | 'returnLiquidation'
  | 'submitLiquidation'
  | 'decideDuplicate'
  | 'reviewDuplicate'
  | 'resolveCollectionPriority'
  | 'recordCashFlow'
  | 'createClient'
  | 'updateClient'
  | 'updateInvoice'
  | 'updatePayment'
  | 'updateSettlement'
  | 'updateAdjustment'
  | 'updateLiquidation'
  | 'updateWaybill'
  | 'deleteClient'
  | 'createRate'
  | 'updateRate'
  | 'deleteRate'
  | 'createAuditLog'
  | 'createUser'
  | 'updateUser'
  | 'deleteUser'
  | 'exportReport'
  | 'executeStarsTask'
  | 'receiveDmsDelivery'
  | 'liftBillingHold'
  | 'placeBillingHold'
  | 'approveCashAdvance'
  | 'disburseCashAdvance';

export const MUTATION_INVALIDATION_MAP: Record<MutationType, readonly string[]> = {
  executeStarsTask: ['stars:tasks', 'stars:routing', 'ar', 'dashboard', 'notifications', 'auditLogs'],
  receiveDmsDelivery: ['waybills', 'billing:waybills', 'invoices', 'ar', 'dashboard', 'reports'],
  liftBillingHold: ['waybills', 'billing:waybills', 'invoices', 'dashboard', 'auditLogs'],
  placeBillingHold: ['waybills', 'billing:waybills', 'dashboard', 'auditLogs'],
  approveCashAdvance: ['cashAdvances', 'cashflow', 'liquidations', 'dashboard', 'notifications', 'auditLogs'],
  disburseCashAdvance: ['cashAdvances', 'cashflow', 'liquidations', 'dashboard', 'notifications', 'auditLogs'],
  approveInvoice: ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'auditLogs', 'navBadges', 'billing:waybills', 'billing:records', 'review:invoices'],
  rejectInvoice: ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'auditLogs', 'navBadges', 'billing:waybills', 'billing:records', 'review:invoices'],
  submitInvoice: ['invoices', 'ar', 'dashboard', 'reports', 'notifications', 'auditLogs', 'navBadges', 'billing:waybills', 'billing:records', 'review:invoices'],

  approvePayment: ['payments', 'invoices', 'ar', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs', 'receipts', 'speedpay'],
  recordPayment: ['payments', 'invoices', 'ar', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs', 'receipts'],
  rejectPayment: ['payments', 'dashboard', 'reports', 'notifications', 'auditLogs'],

  approveSettlement: ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  recordSettlement: ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  rejectSettlement: ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],

  approveAdjustment: ['adjustments', 'ar', 'invoices', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  recordAdjustment: ['adjustments', 'ar', 'invoices', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  rejectAdjustment: ['adjustments', 'dashboard', 'reports', 'notifications', 'auditLogs'],

  validateSpeedpay: ['speedpay', 'payments', 'invoices', 'ar', 'dashboard', 'reports', 'notifications', 'auditLogs', 'receipts'],
  rejectSpeedpay: ['speedpay', 'dashboard', 'reports', 'notifications', 'auditLogs'],

  approveLiquidation: ['liquidations', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  returnLiquidation: ['liquidations', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  submitLiquidation: ['liquidations', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],

  decideDuplicate: ['duplicates', 'dashboard', 'reports', 'notifications', 'auditLogs', 'aiOutputs'],
  reviewDuplicate: ['duplicates', 'dashboard', 'reports', 'notifications', 'auditLogs', 'aiOutputs'],

  resolveCollectionPriority: ['ar', 'dashboard', 'aiOutputs', 'reports', 'auditLogs', 'notifications'],

  recordCashFlow: ['cashflow', 'payments', 'asst', 'liquidations', 'dashboard', 'reports', 'auditLogs', 'notifications'],

  createClient: ['clients', 'dashboard', 'reports', 'auditLogs', 'ar', 'invoices', 'payments'],
  updateClient: ['clients', 'clients:options', 'dashboard', 'reports', 'auditLogs', 'ar', 'invoices', 'payments', 'cashflow', 'waybills'],
  updateInvoice: ['invoices', 'ar', 'payments', 'dashboard', 'reports', 'notifications', 'auditLogs', 'receipts', 'speedpay', 'waybills'],
  updatePayment: ['payments', 'invoices', 'ar', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs', 'receipts', 'speedpay'],
  updateSettlement: ['settlements', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  updateAdjustment: ['adjustments', 'ar', 'invoices', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  updateLiquidation: ['liquidations', 'cashflow', 'dashboard', 'reports', 'notifications', 'auditLogs'],
  updateWaybill: ['waybills', 'rates', 'invoices', 'dashboard', 'reports', 'notifications', 'auditLogs', 'billing:records'],
  deleteClient: ['clients', 'dashboard', 'reports', 'auditLogs', 'ar', 'invoices', 'payments'],

  createRate: ['rates', 'clients', 'invoices', 'reports', 'auditLogs'],
  updateRate: ['rates', 'rates:options', 'clients', 'invoices', 'waybills', 'reports', 'dashboard', 'auditLogs'],
  deleteRate: ['rates', 'clients', 'invoices', 'reports', 'auditLogs'],

  createAuditLog: ['auditLogs'],
  createUser: ['users', 'auditLogs'],
  updateUser: ['users', 'auditLogs'],
  deleteUser: ['users', 'auditLogs'],

  exportReport: ['auditLogs'],
} as const;

export function getInvalidationKeysForMutation(mutation: MutationType): readonly string[] {
  return MUTATION_INVALIDATION_MAP[mutation] || ['dashboard', 'notifications'];
}

export function invalidateForMutation(mutation: MutationType): void {
  const keys = getInvalidationKeysForMutation(mutation);
  invalidateQueries(...keys);
}
