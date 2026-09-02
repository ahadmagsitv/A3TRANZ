/**
 * M15's Notification settings row has no source frame, so there is no gate
 * checklist for it — this is the one runnable check the mock-repo write path
 * gets: every §6.8 driver trigger defaults on, and a toggle persists (not
 * just local screen state, which is what a restart would otherwise expose).
 */
import { notificationsRepo } from '../src/data/mock';
import type { NotificationKind } from '../src/data/contracts';

const KINDS: NotificationKind[] = [
  'job_assigned',
  'job_updated',
  'message',
  'overdue',
  'approved',
  'period_paid',
  'unit_out_of_service',
];

describe('notification settings (M15 · no source frame)', () => {
  it('defaults every §6.8 trigger on', async () => {
    const prefs = await notificationsRepo.getPrefs();
    KINDS.forEach(kind => expect(prefs[kind]).toBe(true));
  });

  it('a write persists past the call that made it', async () => {
    await notificationsRepo.setPref('overdue', false);
    const prefs = await notificationsRepo.getPrefs();
    expect(prefs.overdue).toBe(false);

    // restore, so this test doesn't leak state into ones that run after it
    await notificationsRepo.setPref('overdue', true);
  });
});
