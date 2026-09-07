export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
  /** A delivery URL, never the stored key. Null when there is no attachment. */
  attachmentUri: string | null;
  attachmentName: string | null;
  /** MIME type — an image is shown inline, anything else is offered to download. */
  attachmentType: string | null;
}

/** What the composer holds before Send: already uploaded, not yet a message. */
export interface OutgoingAttachment {
  key: string;
  name: string;
  type: string;
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
  /** Text, an attachment, or both — but never neither. */
  send(
    threadId: string,
    text: string,
    attachment?: OutgoingAttachment | null,
  ): Promise<ChatMessage>;
  markRead(threadId: string): Promise<void>;
}
