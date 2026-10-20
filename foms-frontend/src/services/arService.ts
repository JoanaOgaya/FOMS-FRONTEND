import { http } from './apiClient';
import { toPaged } from './resource';
import type { ARRecord, FollowUpRecord, ListQuery, Paged } from '../types/entities';

export const arService = {
  records: async (query?: ListQuery) => toPaged(await http.get<ARRecord[] | Paged<ARRecord>>('/ar/records', query)),
  aging: () => http.get<{ label: string; value: number }[]>('/ar/aging'),
  followUps: async (query?: ListQuery) => toPaged(await http.get<FollowUpRecord[] | Paged<FollowUpRecord>>('/ar/follow-ups', query)),
  logFollowUp: (body: object) => http.post<FollowUpRecord>('/ar/follow-ups', body),
};
