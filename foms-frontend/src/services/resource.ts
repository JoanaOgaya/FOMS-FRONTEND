/**
 * createResource — shared REST shape (list/get/create/update/remove + workflow transitions).
 * Every domain service builds on this so list/CRUD plumbing exists exactly once.
 */
import { http } from './apiClient';
import type { ListQuery, Paged } from '../types/entities';

export type TransitionAction = 'submit' | 'verify' | 'return' | 'approve' | 'reject';

export interface TransitionBody { remarks?: string }

export function toPaged<T>(res: T[] | Paged<T>): Paged<T> {
  return Array.isArray(res) ? { items: res, total: res.length } : res;
}

export function createResource<T>(base: string) {
  return {
    list: async (query?: ListQuery) => toPaged(await http.get<T[] | Paged<T>>(base, query)),
    get: (id: string) => http.get<T>(`${base}/${id}`),
    create: (body: object) => http.post<T>(base, body),
    update: (id: string, body: object) => http.put<T>(`${base}/${id}`, body),
    remove: (id: string) => http.delete<void>(`${base}/${id}`),
    act: (id: string, action: TransitionAction, body?: TransitionBody) => http.post<T>(`${base}/${id}/${action}`, body),
  };
}
