import { createResource } from './resource';
import type { BillingRate, BillingRecord } from '../types/entities';

export const ratesService = {
  ...createResource<BillingRate>('/billing-rates'),
  records: createResource<BillingRecord>('/billing-records'),
};
