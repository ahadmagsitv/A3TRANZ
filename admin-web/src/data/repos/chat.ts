import type {
  ChatMessage,
  ChatRepo,
  ChatThread,
  OutgoingAttachment,
} from "@/data/contracts/chat";
import { api } from "./api";
import { createStore } from "./store";
import { relative } from "./format";

interface ApiThread {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  driverId: string;
  unread: number;
  preview: string;
  whenLabel: string;
}

interface ApiMessage {
  id: string;
  from: "me" | "them";
  body: string;
  at: string;
  attachmentUri: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
}

const toMessage = (m: ApiMessage): ChatMessage => ({
  id: m.id,
  from: m.from,
  text: m.body,
  at: relative(m.at),
  attachmentUri: m.attachmentUri,
  attachmentName: m.attachmentName,
  attachmentType: m.attachmentType,
});

/**
 * Live: the inbox and the job-detail chat pane both read this, and a sent
 * message has to appear without a refetch.
 *
 * The API serves threads and messages separately; the UI's ChatThread embeds
 * its messages. Rather than N+1 fetching every thread's history to build the
 * list, threads arrive with `messages: []` and `getThread` fills the one being
 * opened. `unread` collapses the API's count to the boolean the rows render.
 */
export const chatStore = createStore<ChatThread[]>([]);

const upsert = (thread: ChatThread): void => {
  const threads = chatStore.get();
  chatStore.set(
    threads.some((t) => t.id === thread.id)
      ? threads.map((t) => (t.id === thread.id ? thread : t))
      : [...threads, thread],
  );
};

export const chatRepo: ChatRepo = {
  async startThread(driverId: string, jobId?: string | null): Promise<string> {
    const { threadId } = await api<{ threadId: string }>("/chat/threads", {
      method: "POST",
      // Omitted, not null-and-ignored: the absence of a job IS the request for
      // the direct thread.
      body: jobId ? { driverId, jobId } : { driverId },
    });
    // The inbox reads from the store, so it has to know about the new thread.
    await chatRepo.listThreads();
    return threadId;
  },

  async listThreads(): Promise<ChatThread[]> {
    const { threads } = await api<{ threads: ApiThread[] }>("/chat/threads");
    const known = chatStore.get();
    const mapped = threads.map((t) => ({
      id: t.id,
      jobId: t.jobId,
      jobTitle: t.jobTitle,
      driverId: t.driverId,
      unread: t.unread > 0,
      // The API already computes both, so the row needs no history to render.
      preview: t.preview,
      whenLabel: t.whenLabel,
      // Keep any history already fetched — relisting must not blank a thread
      // the user has open.
      messages: known.find((k) => k.id === t.id)?.messages ?? [],
    }));
    chatStore.set(mapped);
    return mapped;
  },

  async getThread(id: string): Promise<ChatThread | null> {
    const { messages } = await api<{ messages: ApiMessage[] }>(
      `/chat/threads/${id}/messages`,
    );
    const base = chatStore.get().find((t) => t.id === id);
    if (!base) return null;
    const thread: ChatThread = { ...base, messages: messages.map(toMessage) };
    upsert(thread);
    return thread;
  },

  async send(
    threadId: string,
    text: string,
    attachment?: OutgoingAttachment | null,
  ): Promise<ChatMessage> {
    const { message } = await api<{ message: ApiMessage }>(
      `/chat/threads/${threadId}/messages`,
      {
        method: "POST",
        body: {
          body: text,
          ...(attachment
            ? {
                attachmentKey: attachment.key,
                attachmentName: attachment.name,
                attachmentType: attachment.type,
              }
            : {}),
        },
      },
    );
    const sent = toMessage(message);
    const thread = chatStore.get().find((t) => t.id === threadId);
    // Preview too — the row it came from is showing the message before this
    // one until the next relist otherwise.
    if (thread) {
      upsert({
        ...thread,
        // A photo with no caption still has to read as something in the list.
        preview: sent.text || sent.attachmentName || "Attachment",
        whenLabel: sent.at,
        messages: [...thread.messages, sent],
      });
    }
    return sent;
  },

  async markRead(threadId: string): Promise<void> {
    await api<void>(`/chat/threads/${threadId}/read`, { method: "POST" });
    const thread = chatStore.get().find((t) => t.id === threadId);
    if (thread) upsert({ ...thread, unread: false });
  },
};
