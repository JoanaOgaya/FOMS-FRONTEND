/**
 * createResource — shared REST shape (list/get/create/update/remove + workflow transitions).
 * Every domain service builds on this so list/CRUD plumbing exists exactly once.
 */
import { http } from './apiClient';
import type { ListQuery, Paged } from '../types/entities';

export type TransitionAction = 'submit' | 'verify' | 'return' | 'approve' | 'reject';

export interface TransitionBody { remarks?: string }

export function toPaged<T>(res: T[] | Paged<T> | { data?: T[]; value?: T[]; items?: T[]; total?: number; count?: number }): Paged<T> {
  if (!res) return { items: [], total: 0 };
  if (Array.isArray(res)) return { items: res, total: res.length };
  const anyRes = res as any;
  if (Array.isArray(anyRes.items)) return { items: anyRes.items, total: anyRes.total ?? anyRes.totalCount ?? anyRes.count ?? anyRes.items.length };
  if (Array.isArray(anyRes.data)) return { items: anyRes.data, total: anyRes.total ?? anyRes.count ?? anyRes.totalCount ?? anyRes.data.length };
  if (Array.isArray(anyRes.value)) return { items: anyRes.value, total: anyRes.total ?? anyRes.count ?? anyRes.totalCount ?? anyRes.value.length };
  return { items: [], total: 0 };
}

export function createResource<T>(base: string) {
  return {
    list: async (query?: ListQuery): Promise<Paged<T>> => toPaged<T>(await http.get<any>(base, query)),
    get: (id: string) => http.get<T>(`${base}/${id}`),
    create: (body: object) => http.post<T>(base, body),
    update: (id: string, body: object) => http.put<T>(`${base}/${id}`, body),
    remove: (id: string) => http.delete<void>(`${base}/${id}`),
    act: (id: string, action: TransitionAction, body?: TransitionBody) => http.post<T>(`${base}/${id}/${action}`, body),
  };
}
