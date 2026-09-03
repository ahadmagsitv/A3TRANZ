/**
 * The live connection.
 *
 * React Native ships a WebSocket, so this needs no dependency. The socket
 * carries no data — only `{ type, threadId }` — and subscribers refetch through
 * the normal repo call, keeping authorization and shaping in one place.
 *
 * One connection for the whole app, reconnecting on drop, closed when the last
 * listener goes away (so a backgrounded app is not holding one open).
 */
import {API_URL, token} from '../api';
import {refreshBadges} from './badges';

export interface LiveEvent {
  type: 'message' | 'notification';
  threadId?: string;
}

type Listener = (e: LiveEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
/** Backs off to 30s — a driver in a dead spot should not spin. */
let delay = 1000;

function connect(): void {
  const t = token.get();
  if (!t || socket || listeners.size === 0) {
    return;
  }

  const ws = new WebSocket(
    `${API_URL.replace(/^http/, 'ws')}/realtime?token=${encodeURIComponent(t)}`,
  );
  socket = ws;

  ws.onopen = () => {
    delay = 1000;
  };
  ws.onmessage = ev => {
    try {
      const parsed = JSON.parse(String(ev.data)) as LiveEvent;
      // The tab dot moves on any inbound event, not only while chat is open.
      void refreshBadges();
      listeners.forEach(l => l(parsed));
    } catch {
      // An unreadable frame is not worth dropping the connection over.
    }
  };
  ws.onclose = () => {
    // Only clear if this IS the current socket — a stale close must not orphan
    // a newer connection, which left the screen silent until it was reopened.
    if (socket !== ws) {
      return;
    }
    socket = null;
    if (listeners.size === 0) {
      return;
    }
    retry = setTimeout(connect, delay);
    delay = Math.min(delay * 2, 30_000);
  };
  ws.onerror = () => ws.close();
}

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    // Keep it while anything is still listening: closing on every unmount made
    // the socket churn as the driver moved between the chat list and a thread.
    if (listeners.size > 0) {
      return;
    }
    if (retry) {
      clearTimeout(retry);
    }
    retry = null;
    const dying = socket;
    socket = null;
    dying?.close();
  };
}
