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
      void refreshBadges();
      listeners.forEach(l => l(parsed));
    } catch {
    }
  };
  ws.onclose = () => {
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
