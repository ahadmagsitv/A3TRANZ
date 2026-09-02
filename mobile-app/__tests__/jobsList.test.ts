/**
 * Phase 2's data assumptions, as runnable assertions.
 *
 * These are the three things a screen cannot check for itself: that the fixture
 * clock still puts exactly one job overdue (M4's red card), that the three
 * `.seg` buckets add up to every job the driver has, and that loose photos go
 * in and out of a job without touching an evidence gate.
 */
import { driversRepo, jobsRepo } from '../src/data/mock';
import type { Job, JobStatus } from '../src/data/contracts';

const bucket = (jobs: Job[], statuses: JobStatus[]): Job[] =>
  jobs.filter(j => statuses.includes(j.status));

describe('jobs list (M4 · M5 · M6)', () => {
  it('derives OVERDUE against the fixture day, not the wall clock', async () => {
    const jobs = await jobsRepo.list();
    const overdue = jobs.filter(j => j.overdue);
    // A3-0418 was due the day before the fixture's "today". Everything else
    // still has time. If this ever reads 11, MOCK_NOW has been dropped and
    // every card on M4 renders red.
    expect(overdue.map(j => j.id)).toEqual(['A3-0418']);

    const overview = await driversRepo.overview();
    expect(overdue).toHaveLength(overview.overdue);
  });

  it('inks the Due value on a job due today but not yet late', async () => {
    const job = await jobsRepo.get('A3-0421');
    expect(job?.dueToday).toBe(true);
    expect(job?.overdue).toBe(false);
  });

  it('partitions every job into exactly one segment', async () => {
    const jobs = await jobsRepo.list();
    const pending = bucket(jobs, ['pending', 'blocked']);
    const progress = bucket(jobs, ['in_progress']);
    const completed = bucket(jobs, ['awaiting_approval', 'done']);

    expect(pending).toHaveLength(3);
    expect(progress).toHaveLength(2);
    expect(pending.length + progress.length + completed.length).toBe(
      jobs.length,
    );

    const overview = await driversRepo.overview();
    expect(pending).toHaveLength(overview.pending);
    expect(progress).toHaveLength(overview.inProgress);
  });
});

describe('loose job photos (M8 · M10)', () => {
  it('adds and deletes without touching the evidence gate', async () => {
    const before = (await jobsRepo.get('A3-0421'))!;
    const step = before.step;

    const added = await jobsRepo.addJobPhotos('A3-0421', [
      'file:///mock/upload.jpg',
    ]);
    expect(added.photos).toHaveLength(before.photos.length + 1);
    expect(added.photoCount).toBe(before.photoCount + 1);
    // A loose photo is not evidence: no slot filled, no step moved.
    expect(added.step).toBe(step);
    expect(added.evidence.pickup.every(s => s.uri === null)).toBe(true);

    const newest = added.photos[added.photos.length - 1]!;
    const removed = await jobsRepo.deleteJobPhoto('A3-0421', newest.id);
    expect(removed.photos).toHaveLength(before.photos.length);
    expect(removed.photos.some(p => p.id === newest.id)).toBe(false);
  });

  it('rejects a delete for a photo that is not on the job', async () => {
    await expect(
      jobsRepo.deleteJobPhoto('A3-0421', 'PHO-nope'),
    ).rejects.toThrow(/not on this job/);
  });
});
