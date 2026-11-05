import {api} from '../api';

const POLL_MS = 30_000;

let chatUnread = false;
let alertsUnread = false;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const emit = (): void => {
  listeners.forEach(l => l());
};

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
  }
};

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

export const clearBadges = (): void => {
  chatUnread = false;
  alertsUnread = false;
  emit();
};
