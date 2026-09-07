import type {
  ChatRepo,
  Message,
  Note,
  OutgoingAttachment,
  Thread,
} from '../contracts';
import {api} from '../api';
import {refreshBadges, setChatUnread} from './badges';
import {uploadTo} from './jobs';

/** The API already computes `whenLabel`, `adminLabel` and `preview` (§4). */
export const httpChatRepo: ChatRepo = {
  async threads(): Promise<Thread[]> {
    const {threads} = await api<{threads: Thread[]}>('/chat/threads');
    // The list already answers the badge question, so skip the extra call.
    setChatUnread(threads.some(t => t.unread > 0));
    return threads;
  },

  async openJobThread(jobId: string): Promise<string> {
    // Idempotent server-side, so this is safe on every press — no read-then-
    // create race, and no second thread for the same job.
    const {threadId} = await api<{threadId: string}>('/chat/threads', {
      method: 'POST',
      body: {jobId},
    });
    return threadId;
  },

  async hasUnreadThreads(): Promise<boolean> {
    const {hasUnread} = await api<{hasUnread: boolean}>('/chat/unread');
    setChatUnread(hasUnread);
    return hasUnread;
  },

  async messages(threadId: string): Promise<Message[]> {
    const {messages} = await api<{messages: Message[]}>(
      `/chat/threads/${threadId}/messages`,
    );
    return messages;
  },

  async uploadAttachment(
    threadId: string,
    uri: string,
    type: string,
  ): Promise<string> {
    return uploadTo({threadId}, uri, 'message', undefined, undefined, type);
  },

  async send(
    threadId: string,
    body: string,
    attachment?: OutgoingAttachment | null,
  ): Promise<Message> {
    const {message} = await api<{message: Message}>(
      `/chat/threads/${threadId}/messages`,
      {
        method: 'POST',
        body: {
          body,
          ...(attachment
            ? {
                attachmentKey: attachment.key,
                attachmentName: attachment.name,
                attachmentType: attachment.type,
              }
            : {}),
        },
      },
    );
    return message;
  },

  async markThreadRead(threadId: string): Promise<void> {
    await api<void>(`/chat/threads/${threadId}/read`, {method: 'POST'});
    // Whether the dot clears depends on the OTHER threads, so this re-reads
    // rather than assuming this was the last unread one.
    await refreshBadges();
  },

  async notes(jobId: string): Promise<Note[]> {
    const {notes} = await api<{notes: Note[]}>(`/jobs/${jobId}/notes`);
    return notes;
  },

  async addNote(jobId: string, body: string): Promise<Note> {
    const {note} = await api<{note: Note}>(`/jobs/${jobId}/notes`, {
      method: 'POST',
      body: {body},
    });
    return note;
  },
};
