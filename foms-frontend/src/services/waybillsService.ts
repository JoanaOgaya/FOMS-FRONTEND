import { createResource } from './resource';
import type { Waybill } from '../types/entities';

export const waybillsService = createResource<Waybill>('/shipment-records');
