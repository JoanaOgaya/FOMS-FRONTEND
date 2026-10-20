import { http } from './apiClient';
import { createResource } from './resource';
import type { Report } from '../types/entities';

export const reportsService = {
  ...createResource<Report>('/reports'),
  /** Server-side report data for the given report type and filters. */
  generate: <T = unknown>(type: string, params?: object) => http.get<T>(`/reports/${type}`, params),
};
