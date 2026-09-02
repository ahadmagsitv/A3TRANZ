import { useSyncExternalStore } from 'react';
import {
  anyNotificationUnread,
  anyThreadUnread,
  subscribeBadges,
} from '../data/repos';

/**
 * §6.8 — the two tab dots.
 *
 * Same derivation, one selector each. `chatRepo.markThreadRead` and
 * `notificationsRepo.markRead` refresh the cached booleans, so opening a
 * thread or a notification recomputes the dot. There is no counter held
 * anywhere else that could disagree with the list the driver is looking at.
 *
 * `useSyncExternalStore` rather than a zustand store: it needs a synchronous
 * snapshot, which is exactly what the badge cache holds, and React subscribes
 * with correct tearing semantics in zero extra lines. The cache refreshes on
 * writes and on a 30s poll while a tab is mounted (BACKEND_PLAN §7).
 */
export const useUnreadChat = (): boolean =>
  useSyncExternalStore(subscribeBadges, anyThreadUnread);

export const useUnreadAlerts = (): boolean =>
  useSyncExternalStore(subscribeBadges, anyNotificationUnread);
