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

    await notificationsRepo.setPref('overdue', true);
  });
});
