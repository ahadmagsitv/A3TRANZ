// .bubble .b-me/.b-them — shared by the job chat thread (jobs/[id]
// ?view=chat, mirrors W6-thread) and the Messages inbox (W10-inbox). One
// rendering, two call sites — plan §5 W-09a "mirrors the mobile M12/admin W6
// chat bubble pattern".
import { useEffect, useRef, useState } from "react";
import { Download, FileText, X } from "lucide-react";
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

  // The image opened full size, if any. One at a time — it is a lightbox.
  const [zoomed, setZoomed] = useState<ChatMessage | null>(null);

  // Escape closes it. A modal that only closes by mouse traps the keyboard.
  useEffect(() => {
    if (!zoomed) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setZoomed(null);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [zoomed]);

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
          <div className={m.from === "them" ? "bubble b-them" : "bubble b-me"}>
            {m.attachmentUri && (
              <Attachment message={m} onZoom={() => setZoomed(m)} />
            )}
            {/* An attachment with no caption is a whole message; an empty
                paragraph under it would just add a blank line. */}
            {m.text ? <div>{m.text}</div> : null}
          </div>
          <div className="b-time">{m.at}</div>
        </div>
      ))}
      {/* Scroll target. Zero height so it does not add a gap to the column. */}
      <div ref={end} style={{ height: 0 }} />

      {zoomed?.attachmentUri && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomed.attachmentName ?? "Attachment"}
          onClick={() => setZoomed(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomed.attachmentUri}
            alt={zoomed.attachmentName ?? "Attachment"}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }}
          />
          <div style={{ position: "absolute", top: 18, right: 18, display: "flex", gap: 10 }}>
            <a
              href={zoomed.attachmentUri}
              download={zoomed.attachmentName ?? undefined}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Download"
              style={lightboxBtn}
            >
              <Download style={{ width: 18 }} />
            </a>
            <button type="button" aria-label="Close" style={lightboxBtn}>
              <X style={{ width: 18 }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const lightboxBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  height: 38,
  borderRadius: 19,
  border: "none",
  background: "rgba(255,255,255,.16)",
  color: "#fff",
  cursor: "pointer",
};

/**
 * An image is shown and opens full size; anything else is a download.
 *
 * Branching on the stored MIME type rather than the file extension: the
 * extension is chosen by the server from that same type, so parsing it back
 * out would only add a way to be wrong.
 */
function Attachment({
  message,
  onZoom,
}: {
  message: ChatMessage;
  onZoom: () => void;
}) {
  const name = message.attachmentName ?? "Attachment";
  const isImage = (message.attachmentType ?? "").startsWith("image/");

  if (isImage) {
    return (
      <button
        type="button"
        onClick={onZoom}
        aria-label={`Open ${name}`}
        style={{
          display: "block",
          padding: 0,
          marginBottom: message.text ? 8 : 0,
          border: "none",
          background: "none",
          cursor: "zoom-in",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.attachmentUri ?? ""}
          alt={name}
          style={{
            display: "block",
            maxWidth: 260,
            maxHeight: 220,
            borderRadius: 8,
            objectFit: "cover",
          }}
        />
      </button>
    );
  }

  return (
    <a
      href={message.attachmentUri ?? ""}
      download={name}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: message.text ? 8 : 0,
        padding: "9px 11px",
        borderRadius: 8,
        background: "rgba(127,127,127,.16)",
        color: "inherit",
        textDecoration: "none",
        maxWidth: 260,
      }}
    >
      <FileText style={{ width: 18, flexShrink: 0 }} />
      <span
        style={{
          font: "600 13px var(--f)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      <Download style={{ width: 15, marginLeft: "auto", flexShrink: 0, opacity: 0.75 }} />
    </a>
  );
}
