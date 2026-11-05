import {
  anyNotificationUnread,
  anyThreadUnread,
  chatRepo,
  driversRepo,
  notificationsRepo,
  payrollRepo,
  subscribeMock,
} from '../src/data/mock';

describe('unread badges (§6.8)', () => {
  it('clears the Chat tab dot when the last unread thread is opened', async () => {
    expect(anyThreadUnread()).toBe(true);
    expect(await chatRepo.hasUnreadThreads()).toBe(true);

    const notified: number[] = [];
    const unsubscribe = subscribeMock(() => notified.push(1));

    const threads = await chatRepo.threads();
    const unread = threads.filter(t => t.unread > 0);
    expect(unread.length).toBeGreaterThan(1);

    await chatRepo.markThreadRead(unread[0].id);
    expect(anyThreadUnread()).toBe(true);

    for (const t of unread.slice(1)) {
      await chatRepo.markThreadRead(t.id);
    }
    expect(anyThreadUnread()).toBe(false);
    expect(await chatRepo.hasUnreadThreads()).toBe(false);
    expect(notified).toHaveLength(unread.length);
    await chatRepo.markThreadRead(unread[0].id);
    expect(notified).toHaveLength(unread.length);

    unsubscribe();
  });

  it('ties the Alerts dot, the M18 bell and the M14 list to one count', async () => {
    expect(anyNotificationUnread()).toBe(true);

    const list = await notificationsRepo.list();
    const unread = list.filter(n => !n.read);
    expect(await notificationsRepo.unreadCount()).toBe(unread.length);
    expect((await driversRepo.overview()).unreadNotifications).toBe(
      unread.length,
    );

    await notificationsRepo.markAllRead();

    expect(anyNotificationUnread()).toBe(false);
    expect(await notificationsRepo.unreadCount()).toBe(0);
    expect((await driversRepo.overview()).unreadNotifications).toBe(0);
  });
});

describe('earnings (M24 · M25)', () => {
  it('splits periods so Pending holds everything not yet paid', async () => {
    const [all, pending, paid] = await Promise.all([
      payrollRepo.periods('DRV-001'),
      payrollRepo.periods('DRV-001', 'pending'),
      payrollRepo.periods('DRV-001', 'paid'),
    ]);
    expect(pending.length + paid.length).toBe(all.length);
    expect(pending.map(p => p.status).sort()).toEqual(['accruing', 'held']);
    expect(paid.every(p => p.status === 'paid')).toBe(true);
  });

  it('makes the Pending headline the sum of its own rows', async () => {
    const summary = await payrollRepo.summary('DRV-001');
    const pending = await payrollRepo.periods('DRV-001', 'pending');
    expect(pending.reduce((sum, p) => sum + p.total, 0)).toBe(
      summary.pendingTotal,
    );
    expect(pending.reduce((sum, p) => sum + p.legCount, 0)).toBe(
      summary.pendingLegCount,
    );
    expect(summary.pendingPeriodCount).toBe(pending.length);
  });

  it('keeps every statement’s lines reconciling to its period total', async () => {
    const periods = await payrollRepo.periods('DRV-001');
    for (const p of periods) {
      if (p.lines.length === 0) {
        expect(p.legCount).toBeGreaterThan(0);
        continue;
      }
      const shown = p.lines.reduce((sum, l) => sum + l.amount, 0);
      expect(shown + p.remainingTotal).toBe(p.total);
      expect(p.lines.length + p.remainingLegCount).toBe(p.legCount);
    }
  });
});
