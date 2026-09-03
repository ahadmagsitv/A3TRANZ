"use client";
// W12 — Notifications list (task W-09b). Pixel port of W12-list from
// a3tranz-admin-all.html: `.notif-row` list wired to the real notifications
// mock repo. The five fixture rows already are the plan §6.8 Admin trigger
// list ("driver updated status", "driver uploaded photos", "driver added a
// note", "closeout submitted for approval", "job overdue") — ported as-is
// rather than inventing new copy.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCheck,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { useStore } from "@/data/repos/useStore";
import { notificationsRepo, notificationsStore } from "@/data/repos/notifications";

const ICON: Record<string, { Icon: LucideIcon; bg: string; color: string }> = {
  "refresh-cw": { Icon: RefreshCw, bg: "rgba(37,99,235,.12)", color: "var(--st-progress)" },
  camera: { Icon: Camera, bg: "var(--amber-tint)", color: "var(--amber-ink)" },
  "message-square": { Icon: MessageSquare, bg: "var(--surface-3)", color: "var(--navy)" },
  "check-circle-2": { Icon: CheckCircle2, bg: "var(--amber-tint)", color: "var(--amber-ink)" },
  "alert-triangle": { Icon: AlertTriangle, bg: "rgba(220,38,38,.10)", color: "var(--st-overdue)" },
};

export default function NotificationsPage() {
  const router = useRouter();
  const notifications = useStore(notificationsStore); // live — markRead/mark-all reflect immediately
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    notificationsRepo.list().then(() => setLoaded(true));
  }, []);

  const unread = notifications.filter((n) => !n.read);

  async function markAllRead() {
    await Promise.all(unread.map((n) => notificationsRepo.markRead(n.id)));
  }

  function openRow(n: (typeof notifications)[number]) {
    if (!n.read) notificationsRepo.markRead(n.id);
    if (!n.jobId) return;
    // A message notification opens the conversation, not the job card. It used
    // to land on job detail, which has no way through to the thread.
    router.push(
      n.kind === "message"
        ? `/messages?job=${encodeURIComponent(n.jobId)}`
        : `/jobs/${encodeURIComponent(n.jobId)}`,
    );
  }

  return (
    <>
      <Topbar title="Notifications" />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>Notifications</h1>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Button variant="secondary" size="sm" onClick={markAllRead} disabled={!loaded || unread.length === 0}>
              <CheckCheck />
              Mark all read
            </Button>
          </div>
        </div>

        {!loaded ? (
          <div className="card" style={{ maxWidth: 820 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="notif-row" style={i === 4 ? { borderBottom: "none" } : undefined}>
                <Skeleton width={40} height={40} />
                <div className="b">
                  <Skeleton width="60%" height={13} />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton width="40%" height={11} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="card" style={{ maxWidth: 820 }}>
            <EmptyState icon={<Bell />} title="You're all caught up" description="Notifications from driver activity will show up here." />
          </div>
        ) : (
          <div className="card" style={{ maxWidth: 820 }}>
            {notifications.map((n, i) => {
              const meta = ICON[n.icon] ?? { Icon: Bell, bg: "var(--surface-3)", color: "var(--text-2)" };
              const { Icon } = meta;
              return (
                <div
                  key={n.id}
                  className="notif-row"
                  style={{
                    background: !n.read ? "var(--info-bg)" : undefined,
                    borderBottom: i === notifications.length - 1 ? "none" : undefined,
                    cursor: n.jobId ? "pointer" : undefined,
                  }}
                  onClick={() => openRow(n)}
                  role={n.jobId ? "button" : undefined}
                >
                  <div className="ic" style={{ background: meta.bg, color: meta.color }}>
                    <Icon />
                  </div>
                  <div className="b">
                    <div className="t">{n.title}</div>
                    <div className="m">{n.message}</div>
                  </div>
                  <div className="tm">{n.at}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
