/**
 * useRealtime — mount once inside the authenticated layout. Opens the realtime connection and
 * refetches affected queries on every event (lists, KPIs, sidebar badges, notification bell).
 */
import { useEffect } from 'react';
import { connectRealtime, REALTIME_EVENT_QUERY_MAP } from '../services/realtime';
import { invalidateQueries } from './useQuery';

const GLOBAL_TOPICS = ['dashboard', 'navBadges', 'notifications'];

export function useRealtime(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    return connectRealtime(({ topic }) => {
      if (topic === '*') {
        invalidateQueries();
      } else {
        const mappedKeys = REALTIME_EVENT_QUERY_MAP[topic];
        if (mappedKeys && mappedKeys.length > 0) {
          invalidateQueries(...mappedKeys, ...GLOBAL_TOPICS);
        } else {
          invalidateQueries(topic, ...GLOBAL_TOPICS);
        }
      }
    });
  }, [enabled]);
}
