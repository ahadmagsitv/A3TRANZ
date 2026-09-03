// .bubble .b-me/.b-them — shared by the job chat thread (jobs/[id]
// ?view=chat, mirrors W6-thread) and the Messages inbox (W10-inbox). One
// rendering, two call sites — plan §5 W-09a "mirrors the mobile M12/admin W6
// chat bubble pattern".
import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/data/contracts/chat";

/** The nearest ancestor that actually scrolls — the pane holding the thread. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if (overflow === "auto" || overflow === "scroll") return n;
  }
  return null;
}

export function ChatBubbles({
  messages,
  emptyLabel = "No messages yet.",
}: {
  messages: ChatMessage[];
  emptyLabel?: string;
}) {
  const end = useRef<HTMLDivElement>(null);
  const count = messages.length;

  // Follow the conversation as it grows — but only when already at the bottom.
  // Someone scrolled up reading history should not be yanked down by a message
  // arriving. Opening a thread (first render) always lands on the newest.
  const first = useRef(true);
  useEffect(() => {
    if (count === 0) return;
    const pane = scrollParent(end.current);
    const atBottom =
      !pane || pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120;
    if (first.current || atBottom) {
      end.current?.scrollIntoView({
        block: "end",
        behavior: first.current ? "auto" : "smooth",
      });
      first.current = false;
    }
  }, [count]);

  if (messages.length === 0) return <div className="t-sub">{emptyLabel}</div>;
  return (
    <>
      {messages.map((m) => (
        // Full-width row, bubble aligned inside it. The outgoing side used to
        // be a shrink-to-fit wrapper, so the bubble's `max-width: 70%` resolved
        // against its own content width — every message collapsed to roughly
        // one character per line.
        <div
          key={m.id}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: m.from === "them" ? "flex-start" : "flex-end",
          }}
        >
          <div className={m.from === "them" ? "bubble b-them" : "bubble b-me"}>{m.text}</div>
          <div className="b-time">{m.at}</div>
        </div>
      ))}
      {/* Scroll target. Zero height so it does not add a gap to the column. */}
      <div ref={end} style={{ height: 0 }} />
    </>
  );
}
