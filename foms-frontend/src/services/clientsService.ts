import { createResource } from './resource';
import type { Client } from '../types/entities';

export const clientsService = createResource<Client>('/clients');
