import { createResource } from './resource';
import type { Settlement } from '../types/entities';

export const settlementsService = createResource<Settlement>('/settlements');
