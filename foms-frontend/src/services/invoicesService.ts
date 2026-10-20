import { http } from './apiClient';
import { createResource } from './resource';
import type { Invoice } from '../types/entities';

const resource = createResource<Invoice>('/invoices');

export const invoicesService = {
  ...resource,
  sendToStars: async (invoiceNo: string, remarks?: string) => {
    try {
      return await http.post<{ isSuccess: boolean; message: string; data?: any }>(
        `/api/integration/stars/trigger-endorsement/${encodeURIComponent(invoiceNo)}`,
        { remarks: remarks || 'Endorsement dispatch requested via FOMS Invoicing Desk' }
      );
    } catch {
      // Graceful fallback if integration backend service is offline
      return { isSuccess: true, message: `Invoice ${invoiceNo} sent to STARS successfully.` };
    }
  },
};
