import type { Notification, NotificationsRepo } from "@/data/contracts/notifications";
import { api } from "./api";
import { createStore } from "./store";
import { relative } from "./format";

interface ApiNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  jobId: string | null;
  at: string;
  read: boolean;
}

export const notificationsStore = createStore<Notification[]>([]);

const toNotification = (
  n: ApiNotification,
  icons: Record<string, string>,
): Notification => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  message: n.body,
  icon: icons[n.kind] ?? "bell",
  at: relative(n.at),
  read: n.read,
  ...(n.jobId ? { jobId: n.jobId } : {}),
});

export const notificationsRepo: NotificationsRepo = {
  async list(): Promise<Notification[]> {
    const { notifications, icons } = await api<{
      notifications: ApiNotification[];
      icons: Record<string, string>;
    }>("/notifications");
    const mapped = notifications.map((n) => toNotification(n, icons));
    notificationsStore.set(mapped);
    return mapped;
  },

  async markRead(id: string): Promise<void> {
    await api<void>(`/notifications/${id}/read`, { method: "POST" });
    notificationsStore.set(
      notificationsStore.get().map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  },

  async unreadCount(): Promise<number> {
    const { count } = await api<{ count: number }>("/notifications/unread");
    return count;
  },
};
