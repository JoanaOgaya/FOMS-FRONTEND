import { createResource } from './resource';
import type { Liquidation } from '../types/entities';

export const liquidationsService = createResource<Liquidation>('/liquidations');
