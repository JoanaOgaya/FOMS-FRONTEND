/**
 * Status -> tone/icon. Workflow statuses come from utils/workflow; the keyword
 * lists below cover non-workflow status text returned by the API (aging, payment, logistics).
 */
import { STATUS_TONE, normalizeStatus, type Tone } from './workflow';

const SUCCESS = ['active', 'done', 'delivered', 'success', 'completed', 'paid', 'inflow', 'validated (ctc)', 'billed', 'verified & deposited', 'finalized'];
const DANGER = ['failed', 'overdue', 'outstanding', 'outflow', 'missing', 'error'];
const NEUTRAL = ['deactivated', 'cancelled', 'inactive'];
const INFO = ['in transit', 'picked-up', 'out of delivery', 'for checking'];
const PRIMARY = ['assigned', 'new payment'];

export function statusTone(status: string | null | undefined): Tone {
  const raw = String(status ?? '').toLowerCase().trim();
  const wf = STATUS_TONE[normalizeStatus(raw)];
  if (wf) return wf;
  if (SUCCESS.includes(raw)) return 'success';
  if (DANGER.includes(raw) || raw.includes('60-90') || raw.includes('90+')) return 'danger';
  if (NEUTRAL.includes(raw)) return 'neutral';
  if (INFO.includes(raw)) return 'info';
  if (PRIMARY.includes(raw)) return 'primary';
  return 'warning';
}

const TONE_ICON: Record<Tone, string> = {
  success: 'ti ti-circle-check',
  danger: 'ti ti-circle-x',
  neutral: 'ti ti-circle-off',
  info: 'ti ti-file-check',
  primary: 'ti ti-user-check',
  warning: 'ti ti-clock',
};

export const statusIcon = (tone: Tone): string => TONE_ICON[tone];

/** Hex colour for a tone (charts, inline text). */
const TONE_COLOR: Record<Tone, string> = {
  success: '#10B981',
  danger: '#EF4444',
  neutral: '#64748B',
  info: '#0EA5E9',
  primary: '#7C3AED',
  warning: '#F59E0B',
};

export const statusColor = (status: string | null | undefined): string => TONE_COLOR[statusTone(status)];
