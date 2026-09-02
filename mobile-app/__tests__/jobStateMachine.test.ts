/**
 * The §6.1 invariants, as runnable assertions. If one of these fails, the
 * evidence gate is broken and no screen can be trusted.
 */
import { jobsRepo } from '../src/data/mock';
import {
  gate,
  INSPECTION_ITEMS,
  isOverdue,
  JobStateError,
  TOTAL_REQUIRED_PHOTOS,
} from '../src/data/jobStateMachine';
import type { EvidenceStep, Job } from '../src/data/contracts';

const JOB = 'A3-0421';
const URI = 'file:///mock/shot.jpg';

const fillStep = async (step: EvidenceStep, required: number): Promise<Job> => {
  let job = (await jobsRepo.get(JOB))!;
  for (let i = 0; i < required; i++) {
    job = await jobsRepo.capturePhoto(JOB, step, i, URI);
  }
  return job;
};

describe('job state machine', () => {
  it('requires nine photos across three steps, 2 + 3 + 4', () => {
    expect(TOTAL_REQUIRED_PHOTOS).toBe(9);
    expect(INSPECTION_ITEMS).toHaveLength(12);
  });

  it('rejects a defect with no note', async () => {
    await expect(
      jobsRepo.setInspectionItem(JOB, 'lines', 'defect', '   '),
    ).rejects.toBeInstanceOf(JobStateError);

    const job = await jobsRepo.setInspectionItem(
      JOB,
      'lines',
      'defect',
      'Leak at glad hand — will not hold air.',
    );
    expect(job.inspection?.items.find(i => i.id === 'lines')?.note).toContain(
      'glad hand',
    );
  });

  it('keeps the pickup button locked until 2 photos AND a seal number', async () => {
    const job = await fillStep('pickup', 2);
    // Two photos alone are not enough — §8 Q1.
    expect(gate({ ...job, sealNo: null }, 'pickup')).toMatchObject({
      satisfied: false,
      lockCopy: 'Enter the seal number to confirm pickup',
    });
    expect(gate(job, 'pickup').satisfied).toBe(true);
    // And the repo refuses to blank a seal that a gate depends on.
    await expect(jobsRepo.setSealNumber(JOB, '  ')).rejects.toBeInstanceOf(
      JobStateError,
    );
  });

  it('re-opens the step when a photo is deleted', async () => {
    let job = await fillStep('pickup', 2);
    expect(gate(job, 'pickup').satisfied).toBe(true);

    job = await jobsRepo.deletePhoto(JOB, 'pickup', 1);
    const g = gate(job, 'pickup');
    expect(g.satisfied).toBe(false);
    expect(g.filled).toBe(1);
    // The button is LOCKED, never hidden — the copy is what the lock renders.
    expect(g.lockCopy).toBe('1 photo still to capture');
  });

  it('will not submit without every one of the nine photos', async () => {
    await expect(jobsRepo.submit(JOB)).rejects.toBeInstanceOf(JobStateError);
  });

  it('derives OVERDUE and never stores it', () => {
    const past = '2020-01-01T00:00:00Z';
    expect(isOverdue({ dueAt: past, status: 'pending' })).toBe(true);
    expect(isOverdue({ dueAt: past, status: 'done' })).toBe(false);
  });

  it('gives a driver no way to reach DONE', () => {
    // The contract is the enforcement: there is no method that produces it.
    expect(Object.keys(jobsRepo)).not.toContain('approve');
    expect(Object.keys(jobsRepo)).not.toContain('setStatus');
  });
});
