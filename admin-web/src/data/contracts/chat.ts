export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
}

export interface ChatThread {
  id: string;
  /** null on the direct thread — the conversation not about one job. */
  jobId: string | null;
  /** Resolved job title; null on a direct thread. */
  jobTitle: string | null;
  driverId: string;
  unread: boolean;
  /**
   * Last message and when, from the thread LIST — the row renders these.
   *
   * Deriving them from `messages` meant every row read "No messages yet" until
   * that thread had been opened, because the list deliberately carries no
   * history. Empty preview means genuinely no messages.
   */
  preview: string;
  whenLabel: string;
  messages: ChatMessage[];
}

export interface ChatRepo {
  /**
   * Open a conversation with a driver, creating it if there is none.
   *
   * With a `jobId` that is the thread about that job; without one it is the
   * driver's DIRECT thread. Idempotent either way, so this is safe to call on
   * every press of Message.
   */
  startThread(driverId: string, jobId?: string | null): Promise<string>;
  listThreads(): Promise<ChatThread[]>;
  getThread(id: string): Promise<ChatThread | null>;
  send(threadId: string, text: string): Promise<ChatMessage>;
  markRead(threadId: string): Promise<void>;
}
