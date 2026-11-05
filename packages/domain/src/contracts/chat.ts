export interface Thread {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  driverId: string;
  adminId: string;
  adminLabel: string;
  adminInitials: string;
  preview: string;
  lastMessageAt: string;
  whenLabel: string;
  unread: number;
}

export interface Message {
  id: string;
  threadId: string;
  from: 'me' | 'them';
  authorId: string;
  body: string;
  at: string;
  whenLabel: string;
  attachmentUri: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
}

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
  hasUnreadThreads(): Promise<boolean>;
  messages(threadId: string): Promise<Message[]>;
  send(threadId: string, body: string): Promise<Message>;
  markThreadRead(threadId: string): Promise<void>;
  notes(jobId: string): Promise<Note[]>;
  addNote(jobId: string, body: string): Promise<Note>;
}

