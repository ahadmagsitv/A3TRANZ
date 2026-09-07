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
  /** `.b-att` attachment — a delivery URL, never the stored key. */
  attachmentUri: string | null;
  /** What to call it on download. Null when there is no attachment. */
  attachmentName: string | null;
  /** Its MIME type — an image is shown, anything else is offered as a file. */
  attachmentType: string | null;
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

/** What the compose bar holds before Send: uploaded already, not yet a message. */
export interface OutgoingAttachment {
  key: string;
  name: string;
  type: string;
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
  /** Text, an attachment, or both — but never neither. */
  send(
    threadId: string,
    body: string,
    attachment?: OutgoingAttachment | null,
  ): Promise<Message>;
  /** Put a file in the bucket for this thread and hand back its key. */
  uploadAttachment(threadId: string, uri: string, type: string): Promise<string>;
  /** Opening a thread clears its flag, which must recompute the tab badge. */
  markThreadRead(threadId: string): Promise<void>;
  notes(jobId: string): Promise<Note[]>;
  addNote(jobId: string, body: string): Promise<Note>;
}
