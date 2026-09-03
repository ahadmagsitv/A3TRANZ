/**
 * The live connection.
 *
 * The socket carries no data — only `{ type, threadId }`. Subscribers refetch
 * through the normal repo call, so authorization and shaping stay in one place
 * and the socket cannot leak a thread someone is not on.
 *
 * One connection for the whole app: several screens listen, none of them owns
 * it. It reconnects on drop and closes when the last listener goes away.
 */
import { BASE as API_URL, token } from "./api";

export interface LiveEvent {
  type: "message" | "notification";
  threadId?: string;
}

type Listener = (e: LiveEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
/** Backs off to 30s: a server that is down does not get hammered. */
let delay = 1000;

function connect(): void {
  const t = token.get();
  if (!t || socket || listeners.size === 0) return;

  const url = `${API_URL.replace(/^http/, "ws")}/realtime?token=${encodeURIComponent(t)}`;
  const ws = new WebSocket(url);
  socket = ws;

  ws.onopen = () => {
    delay = 1000;
  };
  ws.onmessage = (ev) => {
    try {
      const parsed = JSON.parse(String(ev.data)) as LiveEvent;
      listeners.forEach((l) => l(parsed));
    } catch {
      // A frame we cannot read is not worth breaking the connection over.
    }
  };
  ws.onclose = () => {
    // Only clear if this IS the current socket. React's dev double-mount closes
    // the first one AFTER the second has opened, and blindly nulling here
    // orphaned the live connection — the inbox then sat silent until it was
    // navigated away from and back.
    if (socket !== ws) return;
    socket = null;
    if (listeners.size === 0) return;
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
    // Keep the connection while anything is still listening. Closing on every
    // unmount made the socket churn on each navigation, and a reconnect that
    // lands mid-render drops whatever arrived in between.
    if (listeners.size > 0) return;
    if (retry) clearTimeout(retry);
    retry = null;
    const dying = socket;
    socket = null;
    dying?.close();
  };
}

/** Test seam: is there a live connection right now? */
export const isLive = (): boolean => socket?.readyState === 1;
