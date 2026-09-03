"use client";
// W10 — Messages inbox (task W-09a). Pixel port of W10-inbox from
// a3tranz-admin-all.html: two-pane `.thread` list + `.bubble` conversation,
// reusing the same ChatBubbles/ChatComposer as the job-chat view (mirrors
// the mobile M12 / admin W6 bubble pattern per plan §5 W-09a).
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { jobLabel } from "@/lib/jobLabel";
import { MessageSquare, Search } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { ChatBubbles } from "@/components/ChatBubbles";
import { ChatComposer } from "@/components/ChatComposer";
import { useStore } from "@/data/repos/useStore";
import { chatRepo, chatStore } from "@/data/repos/chat";
import { subscribeLive } from "@/data/repos/live";
import { driversRepo } from "@/data/repos/drivers";
import { jobsRepo } from "@/data/repos/jobs";
import type { Driver } from "@/data/contracts/drivers";
import type { Job } from "@/data/contracts/jobs";

export default function MessagesPage() {
  const threads = useStore(chatStore); // live — new messages/read state show immediately
  const [loaded, setLoaded] = useState(false); // gates the initial skeleton (plan §2.3 mock delay)
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // `?driver=` — arriving from a driver's detail page with "Message". Threads
  // are job-scoped, so opening one may mean creating it first; the endpoint is
  // idempotent, so landing here twice reuses the same thread.
  const params = useSearchParams();
  const wantedDriver = params.get("driver");
  // `?job=` — arriving from a message notification. Threads are one-per-job,
  // so the job identifies the conversation.
  const wantedJob = params.get("job");

  // Live: a message sent from the driver's phone lands here without a reload.
  // The event is a nudge, not the message — refetching keeps one code path.
  useEffect(
    () =>
      subscribeLive((e) => {
        if (e.type !== "message") return;
        void chatRepo.listThreads();
        if (e.threadId && e.threadId === selectedIdRef.current) {
          void chatRepo.getThread(e.threadId);
        }
      }),
    [],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      const list = await chatRepo.listThreads();
      if (!live) return;
      if (wantedJob) {
        const forJob = list.find((t) => t.jobId === wantedJob);
        if (forJob) setSelectedId(forJob.id);
      }
      if (wantedDriver) {
        try {
          const id = await chatRepo.startThread(wantedDriver);
          if (live) setSelectedId(id);
        } catch (e) {
          // The usual cause is a driver with no jobs yet — say so rather than
          // opening the inbox on someone else's conversation.
          if (live) setStartError(e instanceof Error ? e.message : "Could not open that chat.");
        }
      }
      if (live) setLoaded(true);
    })();
    driversRepo.list().then(setDrivers);
    jobsRepo.list().then(setJobs);
    return () => {
      live = false;
    };
  }, [wantedDriver, wantedJob]);

  const driverName = useMemo(() => {
    const map = new Map(drivers.map((d) => [d.id, d.name]));
    return (id: string) => map.get(id) ?? id;
  }, [drivers]);
  const driverInitials = useMemo(() => {
    const map = new Map(drivers.map((d) => [d.id, d.initials]));
    return (id: string) => map.get(id) ?? "—";
  }, [drivers]);
  const jobTitle = useMemo(() => {
    const map = new Map(jobs.map((j) => [j.id, j.title]));
    return (id: string) => map.get(id) ?? id;
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!query.trim()) return threads;
    const q = query.trim().toLowerCase();
    return threads.filter((t) => driverName(t.driverId).toLowerCase().includes(q));
  }, [threads, query, driverName]);

  const selected = threads.find((t) => t.id === selectedId) ?? filtered[0] ?? null;
  // The live handler is registered once; a ref keeps it looking at the thread
  // that is actually open rather than the one open when it was created.
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  useEffect(() => {
    if (selected?.unread) chatRepo.markRead(selected.id);
  }, [selected]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selected || !text.trim()) return;
    setSending(true);
    try {
      await chatRepo.send(selected.id, text.trim());
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Topbar title="Messages" />
      <div className="content" style={{ padding: 0, display: "flex" }}>
        {!loaded ? (
          <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--hairline)", padding: "14px 18px" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 11, padding: "13px 0" }}>
                <Skeleton width={40} height={40} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="70%" height={13} />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton width="90%" height={11} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div style={{ flex: 1 }}>
            <EmptyState
              icon={<MessageSquare />}
              title={startError ? "Can't start that chat" : "No conversations yet"}
              // The real reason, not a generic empty state: "that driver has no
              // jobs yet" is actionable, "no conversations" is not.
              description={
                startError ?? "Job-scoped threads with drivers will show up here."
              }
            />
          </div>
        ) : (
          <>
            <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--hairline)", overflowY: "auto", background: "var(--surface)" }}>
              <div style={{ padding: "14px 18px" }}>
                <div className="search" style={{ flex: 1 }}>
                  <Search />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search messages…"
                    style={{ border: "none", outline: "none", background: "transparent", flex: 1, font: "inherit", color: "inherit" }}
                  />
                </div>
              </div>
              {filtered.map((t) => {
                const last = t.messages[t.messages.length - 1];
                return (
                  <div
                    key={t.id}
                    className={`thread${selected?.id === t.id ? " on" : ""}`}
                    onClick={() => setSelectedId(t.id)}
                    role="button"
                  >
                    <div className="av">{driverInitials(t.driverId)}</div>
                    <div className="b">
                      <div className="n">
                        {driverName(t.driverId)}
                        <span className="tm">{last?.at ?? ""}</span>
                      </div>
                      <div className="p">{last?.text ?? "No messages yet"}</div>
                    </div>
                    {t.unread && <span className="unread" />}
                  </div>
                );
              })}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
              {selected ? (
                <>
                  <div
                    style={{
                      padding: "14px 24px",
                      borderBottom: "1px solid var(--hairline)",
                      background: "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="mini-av" style={{ width: 34, height: 34 }}>
                      {driverInitials(selected.driverId)}
                    </span>
                    <div>
                      <div style={{ font: "700 14px var(--f)", color: "var(--text)" }}>{driverName(selected.driverId)}</div>
                      <div className="t-sub">
                        Job {jobLabel(selected.jobId)} · {jobTitle(selected.jobId)}
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Keyed by thread so opening a different conversation lands on its
                        newest message rather than inheriting the last one's scroll. */}
                    <ChatBubbles key={selected.id} messages={selected.messages} />
                  </div>
                  <ChatComposer
                    value={text}
                    onChange={setText}
                    onSubmit={handleSend}
                    placeholder={`Message ${driverName(selected.driverId).split(" ")[0]}…`}
                    sending={sending}
                  />
                </>
              ) : (
                <EmptyState icon={<MessageSquare />} title="No thread selected" description="Pick a conversation on the left." />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
