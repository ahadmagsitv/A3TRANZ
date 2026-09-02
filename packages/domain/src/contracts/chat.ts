/**
 * Threads are job-scoped (§6.8). The Chat tab always opens the thread LIST,
 * never a single thread.
 */
export interface Thread {
  id: string;
  jobId: string;
  /** The job's title, resolved for the row subtitle. */
  jobTitle: string;
  driverId: string;
  adminId: string;
  /** 'Dispatch — Maria' */
  adminLabel: string;
  adminInitials: string;
  preview: string;
  /** ISO. `whenLabel` is the formatted view of it (BACKEND_PLAN §4). */
  lastMessageAt: string;
  whenLabel: string;
  /** Count for the row; the tab badge is `unread > 0` (§R-CH2). */
  unread: number;
}

export interface Message {
  id: string;
  threadId: string;
  /** Resolved per-viewer: the same row is 'me' to its author (§R-CH3). */
  from: 'me' | 'them';
  authorId: string;
  body: string;
  at: string;
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
  at: string;
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

/* §R-CH1 · admin named these listThreads/getThread/markRead. Mobile's names
 *          win; admin's adapter is a one-line rename per method.
 * §R-CH2 · mobile `unread: number`, admin `unread: boolean`. Count is stored
 *          (derived from thread_reads.last_read_at); the boolean is `> 0`.
 * §R-CH3 · admin inlined `messages[]` on the thread. Kept separate: M12 opens
 *          one thread at a time and the list must not ship every message.
 *          `from` is computed per-request against the caller's user id — the
 *          same row is 'me' to the driver and 'them' to dispatch. */
