import { createResource } from './resource';
import type { Payment, Receipt } from '../types/entities';

export const paymentsService = {
  ...createResource<Payment>('/payments'),
  receipts: createResource<Receipt>('/official-receipts'),
};
