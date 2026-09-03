import type { ChatMessage, ChatRepo, ChatThread } from "@/data/contracts/chat";
import { api } from "./api";
import { createStore } from "./store";
import { relative } from "./format";

interface ApiThread {
  id: string;
  jobId: string;
  driverId: string;
  unread: number;
}

interface ApiMessage {
  id: string;
  from: "me" | "them";
  body: string;
  at: string;
}

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
  async startThread(driverId: string): Promise<string> {
    const { threadId } = await api<{ threadId: string }>("/chat/threads", {
      method: "POST",
      body: { driverId },
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
      driverId: t.driverId,
      unread: t.unread > 0,
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
    const thread: ChatThread = {
      ...base,
      messages: messages.map((m) => ({
        id: m.id,
        from: m.from,
        text: m.body,
        at: relative(m.at),
      })),
    };
    upsert(thread);
    return thread;
  },

  async send(threadId: string, text: string): Promise<ChatMessage> {
    const { message } = await api<{ message: ApiMessage }>(
      `/chat/threads/${threadId}/messages`,
      { method: "POST", body: { body: text } },
    );
    const sent: ChatMessage = {
      id: message.id,
      from: message.from,
      text: message.body,
      at: relative(message.at),
    };
    const thread = chatStore.get().find((t) => t.id === threadId);
    if (thread) upsert({ ...thread, messages: [...thread.messages, sent] });
    return sent;
  },

  async markRead(threadId: string): Promise<void> {
    await api<void>(`/chat/threads/${threadId}/read`, { method: "POST" });
    const thread = chatStore.get().find((t) => t.id === threadId);
    if (thread) upsert({ ...thread, unread: false });
  },
};
