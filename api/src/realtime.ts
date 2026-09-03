/**
 * Live nudges over a WebSocket.
 *
 * The socket carries no data — only `{ type, threadId }`. Clients hear that
 * something changed and refetch through the normal REST route, which is where
 * authorization and serialization already live. Pushing message bodies down
 * the socket would mean a second copy of both, and the first bug would be a
 * driver reading a thread they are not on.
 *
 * BACKEND_PLAN §7 deferred this behind "add when someone asks for sub-second
 * delivery". They asked: sending from one app left the other stale until it
 * was reloaded.
 *
 * ponytail: one process, sockets in a Map. A second instance would not see
 * these — move to Postgres LISTEN/NOTIFY or Redis pub/sub the day this runs on
 * more than one node.
 */
import type { WebSocket } from 'ws';

export interface LiveEvent {
  type: 'message' | 'notification';
  threadId?: string;
}

/** userId → their open sockets. One person, several devices or tabs. */
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

/**
 * Tell these users something changed. Never throws: a dead socket must not
 * fail the request that was writing to the database.
 */
export const publish = (userIds: (string | null | undefined)[], event: LiveEvent): void => {
  const payload = JSON.stringify(event);
  for (const id of new Set(userIds.filter(Boolean) as string[])) {
    for (const ws of sockets.get(id) ?? []) {
      try {
        if (ws.readyState === ws.OPEN) ws.send(payload);
      } catch {
        // The close handler will clean it up.
      }
    }
  }
};

/** Test seam — how many sockets a user currently holds. */
export const socketCount = (userId: string): number => sockets.get(userId)?.size ?? 0;
