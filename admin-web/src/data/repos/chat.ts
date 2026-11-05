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
      body: jobId ? { driverId, jobId } : { driverId },
    });
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
      preview: t.preview,
      whenLabel: t.whenLabel,
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
    if (thread) {
      upsert({
        ...thread,
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
