import { http } from './apiClient';
import { createResource } from './resource';
import type { AppUserRecord } from '../types/entities';

export const usersService = {
  ...createResource<AppUserRecord>('/users'),
  setStatus: (id: string, status: AppUserRecord['status']) => http.patch<AppUserRecord>(`/users/${id}/status`, { status }),
};
