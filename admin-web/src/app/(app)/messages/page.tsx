"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { jobLabel } from "@/lib/jobLabel";
import { MessageSquare, Search } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { ChatBubbles } from "@/components/ChatBubbles";
import { ChatComposer, type DraftAttachment } from "@/components/ChatComposer";
import { useStore } from "@/data/repos/useStore";
import { chatRepo, chatStore } from "@/data/repos/chat";
import { subscribeLive } from "@/data/repos/live";
import { driversRepo } from "@/data/repos/drivers";
import { jobsRepo } from "@/data/repos/jobs";
import type { Driver } from "@/data/contracts/drivers";
import type { Job } from "@/data/contracts/jobs";

export default function MessagesPage() {
  const threads = useStore(chatStore);
  const [loaded, setLoaded] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<DraftAttachment | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const params = useSearchParams();
  const wantedDriver = params.get("driver");
  const wantedJob = params.get("job");
  const wantedThread = params.get("thread");

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
      if (wantedThread && list.some((t) => t.id === wantedThread)) {
        setSelectedId(wantedThread);
      }
      if (wantedJob) {
        const forJob = list.find((t) => t.jobId === wantedJob);
        if (forJob) setSelectedId(forJob.id);
      }
      if (wantedDriver) {
        try {
          const id = await chatRepo.startThread(wantedDriver);
          if (live) setSelectedId(id);
        } catch (e) {
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
  }, [wantedDriver, wantedJob, wantedThread]);

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
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;

  const openId = selected?.id ?? null;
  useEffect(() => {
    if (openId) void chatRepo.getThread(openId);
  }, [openId]);

  useEffect(() => {
    if (selected?.unread) chatRepo.markRead(selected.id);
  }, [selected]);

  useEffect(() => {
    setDraft(null);
    setText("");
  }, [openId]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selected || (!text.trim() && !draft)) return;
    setSending(true);
    try {
      await chatRepo.send(selected.id, text.trim(), draft);
      setText("");
      setDraft(null);
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
              description={
                startError ?? "Conversations with drivers will show up here."
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
              {filtered.map((t) => (
                  <div
                    key={t.id}
                    className={`thread${selected?.id === t.id ? " on" : ""}`}
                    onClick={() => setSelectedId(t.id)}
                    role="button"
                  >
                    <div className="av">{driverInitials(t.driverId)}</div>
                    <div className="b">
                      <div className="n">
                        {t.jobId
                          ? `${jobLabel(t.jobId)} · ${jobTitle(t.jobId)}`
                          : driverName(t.driverId)}
                        <span className="tm">{t.whenLabel}</span>
                      </div>
                      <div className="t-sub" style={{ fontSize: 11 }}>
                        {t.jobId ? driverName(t.driverId) : "Direct message"}
                      </div>
                      <div className="p">{t.preview || "No messages yet"}</div>
                    </div>
                    {t.unread && <span className="unread" />}
                  </div>
              ))}
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
                        {selected.jobId
                          ? `Job ${jobLabel(selected.jobId)} · ${jobTitle(selected.jobId)}`
                          : "Direct message · not about one job"}
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                    <ChatBubbles key={selected.id} messages={selected.messages} />
                  </div>
                  <ChatComposer
                    value={text}
                    onChange={setText}
                    onSubmit={handleSend}
                    placeholder={`Message ${driverName(selected.driverId).split(" ")[0]}…`}
                    sending={sending}
                    threadId={selected.id}
                    attachment={draft}
                    onAttachmentChange={setDraft}
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
