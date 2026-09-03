export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
}

export interface ChatThread {
  id: string;
  jobId: string;
  driverId: string;
  unread: boolean;
  messages: ChatMessage[];
}

export interface ChatRepo {
  /**
   * Open the conversation with a driver, creating it if there is none.
   * Threads are job-scoped, so this attaches to their most recent job.
   */
  startThread(driverId: string): Promise<string>;
  listThreads(): Promise<ChatThread[]>;
  getThread(id: string): Promise<ChatThread | null>;
  send(threadId: string, text: string): Promise<ChatMessage>;
  markRead(threadId: string): Promise<void>;
}
