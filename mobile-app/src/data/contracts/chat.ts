export interface Thread {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  adminId: string;
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
  whenLabel: string;
  body: string;
}

export interface OutgoingAttachment {
  key: string;
  name: string;
  type: string;
}

export interface ChatRepo {
  threads(): Promise<Thread[]>;
  openJobThread(jobId: string): Promise<string>;
  hasUnreadThreads(): Promise<boolean>;
  messages(threadId: string): Promise<Message[]>;
  send(
    threadId: string,
    body: string,
    attachment?: OutgoingAttachment | null,
  ): Promise<Message>;
  uploadAttachment(threadId: string, uri: string, type: string): Promise<string>;
  markThreadRead(threadId: string): Promise<void>;
  notes(jobId: string): Promise<Note[]>;
  addNote(jobId: string, body: string): Promise<Note>;
}
