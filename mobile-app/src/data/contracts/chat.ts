/**
 * Threads are job-scoped (§6.8). The Chat tab always opens the thread LIST,
 * never a single thread.
 */
export interface Thread {
  id: string;
  jobId: string;
  /** The job's title, resolved for the row subtitle. */
  jobTitle: string;
  adminId: string;
  /** 'Dispatch — Maria' */
  adminLabel: string;
  adminInitials: string;
  preview: string;
  whenLabel: string;
  unread: number;
}

export interface Message {
  id: string;
  threadId: string;
  from: 'me' | 'them';
  authorId: string;
  body: string;
  whenLabel: string;
  /** `.b-att` image attachment. */
  attachmentUri: string | null;
}

/** M13 job notes — same compose bar as chat, different stream. */
export interface Note {
  id: string;
  jobId: string;
  authorId: string;
  authorName: string;
  initials: string;
  whenLabel: string;
  body: string;
}

export interface ChatRepo {
  threads(): Promise<Thread[]>;
  /** Boolean, not a count — the tab carries a dot (§6.8). */
  hasUnreadThreads(): Promise<boolean>;
  messages(threadId: string): Promise<Message[]>;
  send(threadId: string, body: string): Promise<Message>;
  /** Opening a thread clears its flag, which must recompute the tab badge. */
  markThreadRead(threadId: string): Promise<void>;
  notes(jobId: string): Promise<Note[]>;
  addNote(jobId: string, body: string): Promise<Note>;
}
