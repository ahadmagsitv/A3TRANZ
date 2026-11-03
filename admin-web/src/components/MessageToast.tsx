"use client";
// QA R27 — a new chat message pops up wherever the office user is, instead of
// waiting to be found in Notifications. Uses the one live socket (live.ts).
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { subscribeLive, type LiveEvent } from "@/data/repos/live";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";

export function MessageToast() {
  const me = useStore(authStore);
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState<LiveEvent | null>(null);

  useEffect(
    () =>
      subscribeLive((e) => {
        if (e.type !== "message" || !e.threadId || e.authorId === me?.id) return;
        // ponytail: suppressed on the whole inbox, not just the open thread —
        // the inbox already shows the new message and its unread dot.
        if (window.location.pathname.startsWith("/messages")) return;
        setToast(e);
      }),
    [me?.id],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast || pathname.startsWith("/messages")) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast toast-info"
      style={{ position: "fixed", right: 24, bottom: 24, zIndex: 1000, maxWidth: 380, boxShadow: "0 8px 24px rgba(15,30,46,.18)" }}
    >
      <MessageSquare />
      <button
        type="button"
        onClick={() => {
          setToast(null);
          router.push(`/messages?thread=${encodeURIComponent(toast.threadId!)}`);
        }}
        style={{ flex: 1, textAlign: "left", background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", padding: 0 }}
      >
        New message{toast.from ? ` from ${toast.from}` : ""}
        {toast.preview && (
          <span style={{ display: "block", font: "500 13px var(--f)", marginTop: 2, opacity: 0.85 }}>{toast.preview}</span>
        )}
      </button>
      <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0 }}>
        <X />
      </button>
    </div>
  );
}
