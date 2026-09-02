import type {ChatRepo, Message, Note, Thread} from '../contracts';
import {api} from '../api';
import {refreshBadges, setChatUnread} from './badges';

/** The API already computes `whenLabel`, `adminLabel` and `preview` (§4). */
export const httpChatRepo: ChatRepo = {
  async threads(): Promise<Thread[]> {
    const {threads} = await api<{threads: Thread[]}>('/chat/threads');
    // The list already answers the badge question, so skip the extra call.
    setChatUnread(threads.some(t => t.unread > 0));
    return threads;
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

  async send(threadId: string, body: string): Promise<Message> {
    const {message} = await api<{message: Message}>(
      `/chat/threads/${threadId}/messages`,
      {method: 'POST', body: {body}},
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
