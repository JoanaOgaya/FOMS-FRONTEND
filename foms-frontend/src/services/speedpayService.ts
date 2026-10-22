import { http } from './apiClient';
import { createResource } from './resource';
import type { SpeedPaySubmission } from '../types/entities';

const isProd = import.meta.env.PROD;
const rawSpeedpayUrl = ((import.meta as any).env?.VITE_SPEEDPAY_API_URL || '').trim().replace(/\/$/, '');
const speedpayApiUrl = isProd && rawSpeedpayUrl.includes('localhost') ? '' : rawSpeedpayUrl;

export const speedpayService = {
  ...createResource<SpeedPaySubmission>(speedpayApiUrl ? `${speedpayApiUrl}/speedpay/submissions` : '/speedpay/submissions'),
  /** Public SpeedPay portal: client submits proof of payment (no session). */
  submit: (body: object) => http.post<SpeedPaySubmission>(speedpayApiUrl ? `${speedpayApiUrl}/speedpay/submissions` : '/speedpay/submissions', body),
  validate: (id: string, body?: { status?: string; remarks?: string; notes?: string }) =>
    http.post<SpeedPaySubmission>(speedpayApiUrl ? `${speedpayApiUrl}/speedpay/submissions/${id}/verify` : `/speedpay/submissions/${id}/verify`, body),
};
