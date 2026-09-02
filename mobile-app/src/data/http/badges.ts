/**
 * §6.8 — the two tab dots, over HTTP.
 *
 * `useSyncExternalStore` needs a SYNCHRONOUS snapshot, which a fetch cannot
 * give it. So the booleans are cached here and refreshed on the two events
 * that can move them: a repo write (immediately) and a poll while a tab is
 * actually mounted.
 *
 * Polling rather than a socket is the plan's own call (BACKEND_PLAN §7): a dot
 * is a boolean, and 30s is well inside what a driver notices. It runs only
 * while something is subscribed, so a backgrounded app is not holding a timer
 * open against the server.
 */
import {api} from '../api';

const POLL_MS = 30_000;

let chatUnread = false;
let alertsUnread = false;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const emit = (): void => {
  listeners.forEach(l => l());
};

/** Called by every repo write that can move a badge, and by the poll. */
export const refreshBadges = async (): Promise<void> => {
  try {
    const [chat, alerts] = await Promise.all([
      api<{hasUnread: boolean}>('/chat/unread'),
      api<{count: number}>('/notifications/unread'),
    ]);
    const next = {chat: chat.hasUnread, alerts: alerts.count > 0};
    if (next.chat === chatUnread && next.alerts === alertsUnread) {
      return;
    }
    chatUnread = next.chat;
    alertsUnread = next.alerts;
    emit();
  } catch {
    // A dot is not worth surfacing a failure for — the next poll retries, and
    // a stale dot is better than an error state on a tab bar.
  }
};

/** Set directly by a repo that already knows the answer, to skip a round trip. */
export const setChatUnread = (v: boolean): void => {
  if (v !== chatUnread) {
    chatUnread = v;
    emit();
  }
};

export const setAlertsUnread = (v: boolean): void => {
  if (v !== alertsUnread) {
    alertsUnread = v;
    emit();
  }
};

export const subscribeBadges = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (timer === null) {
    void refreshBadges();
    timer = setInterval(() => void refreshBadges(), POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

export const anyThreadUnread = (): boolean => chatUnread;
export const anyNotificationUnread = (): boolean => alertsUnread;

/** Signing out must not leave the previous driver's dots lit. */
export const clearBadges = (): void => {
  chatUnread = false;
  alertsUnread = false;
  emit();
};
