import { createResource } from './resource';
import type { FinancialAdjustment } from '../types/entities';

export const adjustmentsService = createResource<FinancialAdjustment>('/adjustments');
