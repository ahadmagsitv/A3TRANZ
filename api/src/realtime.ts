import type { WebSocket } from 'ws';

export interface LiveEvent {
  type: 'message' | 'notification';
  threadId?: string;
  authorId?: string;
  from?: string;
  preview?: string;
}

const sockets = new Map<string, Set<WebSocket>>();

export const addSocket = (userId: string, ws: WebSocket): void => {
  const set = sockets.get(userId) ?? new Set<WebSocket>();
  set.add(ws);
  sockets.set(userId, set);
};

export const removeSocket = (userId: string, ws: WebSocket): void => {
  const set = sockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) sockets.delete(userId);
};

export const publish = (userIds: (string | null | undefined)[], event: LiveEvent): void => {
  const payload = JSON.stringify(event);
  for (const id of new Set(userIds.filter(Boolean) as string[])) {
    for (const ws of sockets.get(id) ?? []) {
      try {
        if (ws.readyState === ws.OPEN) ws.send(payload);
      } catch {
      }
    }
  }
};

