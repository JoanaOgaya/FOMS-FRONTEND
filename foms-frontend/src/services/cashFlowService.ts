import { createResource } from './resource';
import type { CashFlowRecord } from '../types/entities';

export const cashFlowService = createResource<CashFlowRecord>('/cash-flow');
