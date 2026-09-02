import type { ChatRepo, Message, Note } from '../contracts';
import { anyThreadUnread, clone, db, delay, MockError, notifyMock } from './db';

const stamp = (): string =>
  new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

export const mockChatRepo: ChatRepo = {
  async threads() {
    await delay();
    return db.threads.map(clone);
  },

  /** Boolean, derived from the same list — never a second counter (§6.8). */
  async hasUnreadThreads() {
    await delay();
    return anyThreadUnread();
  },

  async messages(threadId) {
    await delay();
    return db.messages.filter(m => m.threadId === threadId).map(clone);
  },

  async send(threadId, body) {
    await delay();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new MockError('Cannot send an empty message.');
    }
    if (!db.threads.some(t => t.id === threadId)) {
      throw new MockError(`No thread ${threadId}.`);
    }
    const message: Message = {
      id: `MSG-${Date.now()}`,
      threadId,
      from: 'me',
      authorId: db.session?.driverId ?? db.credentials.driverId,
      body: trimmed,
      whenLabel: stamp(),
      attachmentUri: null,
    };
    db.messages.push(message);
    const thread = db.threads.find(t => t.id === threadId);
    if (thread) {
      thread.preview = trimmed;
      thread.whenLabel = 'now';
    }
    return clone(message);
  },

  async markThreadRead(threadId) {
    await delay();
    const thread = db.threads.find(t => t.id === threadId);
    if (thread && thread.unread > 0) {
      thread.unread = 0;
      // Opening a thread must recompute the Chat tab dot, not just this row.
      notifyMock();
    }
  },

  async notes(jobId) {
    await delay();
    return db.notes.filter(n => n.jobId === jobId).map(clone);
  },

  async addNote(jobId, body) {
    await delay();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new MockError('Cannot add an empty note.');
    }
    const driverId = db.session?.driverId ?? db.credentials.driverId;
    const driver = db.drivers.find(d => d.id === driverId);
    const note: Note = {
      id: `NTE-${Date.now()}`,
      jobId,
      authorId: driverId,
      authorName: driver?.name ?? 'Driver',
      initials: driver?.initials ?? '??',
      whenLabel: stamp(),
      body: trimmed,
    };
    db.notes.push(note);
    return clone(note);
  },
};
