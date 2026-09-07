/**
 * A thread is either JOB-SCOPED or DIRECT (§6.8). The Chat tab always opens
 * the thread LIST, never a single thread.
 *
 * `jobId === null` IS the direct thread — the one conversation with the office
 * that is not about a single job.
 */
export interface Thread {
  id: string;
  /** null on the direct thread. */
  jobId: string | null;
  /** The job's title, for the row subtitle. null on a direct thread. */
  jobTitle: string | null;
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
  /**
   * Open the thread for a job, creating it on first use. Returns its id.
   *
   * The Message button on a job used to look one up and quietly do nothing
   * when there was none — which is every job nobody has written to yet.
   */
  openJobThread(jobId: string): Promise<string>;
  /** Boolean, not a count — the tab carries a dot (§6.8). */
  hasUnreadThreads(): Promise<boolean>;
  messages(threadId: string): Promise<Message[]>;
  send(threadId: string, body: string): Promise<Message>;
  /** Opening a thread clears its flag, which must recompute the tab badge. */
  markThreadRead(threadId: string): Promise<void>;
  notes(jobId: string): Promise<Note[]>;
  addNote(jobId: string, body: string): Promise<Note>;
}
