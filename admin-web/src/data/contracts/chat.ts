export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
  attachmentUri: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
}

export interface OutgoingAttachment {
  key: string;
  name: string;
  type: string;
}

export interface ChatThread {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  driverId: string;
  unread: boolean;
  preview: string;
  whenLabel: string;
  messages: ChatMessage[];
}

export interface ChatRepo {
  startThread(driverId: string, jobId?: string | null): Promise<string>;
  listThreads(): Promise<ChatThread[]>;
  getThread(id: string): Promise<ChatThread | null>;
  send(
    threadId: string,
    text: string,
    attachment?: OutgoingAttachment | null,
  ): Promise<ChatMessage>;
  markRead(threadId: string): Promise<void>;
}
