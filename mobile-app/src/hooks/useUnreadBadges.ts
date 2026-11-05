import { useSyncExternalStore } from 'react';
import {
  anyNotificationUnread,
  anyThreadUnread,
  subscribeBadges,
} from '../data/repos';

export const useUnreadChat = (): boolean =>
  useSyncExternalStore(subscribeBadges, anyThreadUnread);

export const useUnreadAlerts = (): boolean =>
  useSyncExternalStore(subscribeBadges, anyNotificationUnread);
