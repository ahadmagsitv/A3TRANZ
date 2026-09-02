/**
 * The one runnable check. These are the invariants from the state machine's
 * own header block — the rules that stop a job reaching the office without its
 * evidence. If any of these break, the product is broken.
 *
 *   node --experimental-strip-types src/jobStateMachine.test.ts
 */
import assert from 'node:assert/strict';
import {
  INSPECTION_ITEMS,
  JobStateError,
  TOTAL_REQUIRED_PHOTOS,
  advance,
  blankEvidence,
  blankInspection,
  capturePhoto,
  deletePhoto,
  gate,
  isDueToday,
  isOverdue,
  pretripGate,
  reportDefect,
  submit,
  validateInspectionItem,
} from './jobStateMachine.ts';
import type { EvidenceStep, Job, JobStep } from './contracts/jobs.ts';

const refs = { containerNo: 'MSCU-448120', chassisId: 'CH-4402', sealNo: null };

const job = (over: Partial<Job> = {}): Job => ({
  id: 'A3-0421',
  title: 'Container to Katy',
  customerId: 'CUS-1',
  customerName: 'Gulf Freight',
  type: 'import',
  priority: 'high',
  status: 'pending',
  step: 'pretrip',
  driverId: 'DRV-001',
  location: 'Bayport Terminal',
  address: '1 Bayport Rd',
  mapQuery: null,
  pickupLocation: 'Bayport Terminal',
  deliveryLocation: 'Katy DC',
  assignedAt: '2026-08-27T08:00:00Z',
  assignedLabel: null,
  dueAt: '2026-08-27T22:00:00Z',
  dueLabel: null,
  timezone: 'America/Chicago',
  containerNo: refs.containerNo,
  sealNo: null,
  truckId: 'TRK-118',
  chassisId: refs.chassisId,
  price: 120,
  legs: [],
  description: null,
  instructions: null,
  photoCount: 0,
  inspection: blankInspection(),
  evidence: blankEvidence(refs),
  attachments: [],
  photos: [],
  timeline: [],
  submittedAt: null,
  approvedAt: null,
  overdue: false,
  dueToday: false,
  version: 1,
  ...over,
});

/** Fill every slot on a step. */
const fillStep = (j: Job, step: EvidenceStep): Job =>
  j.evidence[step].reduce(
    (acc, s) => capturePhoto(acc, step, s.index, `file://${step}-${s.index}.jpg`),
    j,
  );

const passAll = (j: Job): Job => ({
  ...j,
  inspection: {
    items: INSPECTION_ITEMS.map(i => ({
      id: i.id,
      label: i.label,
      result: 'pass' as const,
      note: null,
      photoUri: null,
    })),
    passedAt: '2026-08-27T08:10:00Z',
    loggedByLabel: 'John Reyes',
  },
});

const throws = (fn: () => unknown, why: string) =>
  assert.throws(fn, JobStateError, why);

// ── ① Pre-trip ───────────────────────────────────────────────────────────────

assert.equal(INSPECTION_ITEMS.length, 12, '12-item DOT checklist');
assert.equal(pretripGate(job()).satisfied, false, 'blank checklist is locked');
assert.equal(pretripGate(passAll(job())).satisfied, true, '12/12 pass unlocks');

throws(
  () => validateInspectionItem('defect', '   '),
  'a defect with a blank note is rejected at the boundary',
);
assert.equal(validateInspectionItem('defect', ' bald tire '), 'bald tire');
assert.equal(validateInspectionItem('pass'), null);

// A defect blocks the job and does NOT let it start.
{
  const withDefect = job({
    inspection: {
      ...blankInspection(),
      items: blankInspection().items.map(i =>
        i.id === 'tires'
          ? { ...i, result: 'defect' as const, note: 'bald' }
          : { ...i, result: 'pass' as const },
      ),
    },
  });
  assert.equal(pretripGate(withDefect).satisfied, false);
  assert.equal(reportDefect(withDefect).status, 'blocked');
  throws(() => advance(reportDefect(withDefect), 'pretrip'), 'blocked job cannot advance');
}

// ── ② Pickup: 2 photos AND a seal number ─────────────────────────────────────

{
  const p = passAll(job({ status: 'in_progress', step: 'pickup' }));
  assert.equal(gate(p, 'pickup').required, 2);
  assert.equal(gate(p, 'pickup').satisfied, false, 'no photos, no seal');

  const photos = fillStep(p, 'pickup');
  assert.equal(
    gate(photos, 'pickup').satisfied,
    false,
    'Q1: two photos alone do NOT unlock Confirm pickup',
  );
  assert.match(gate(photos, 'pickup').lockCopy ?? '', /seal number/i);

  const sealed = { ...photos, sealNo: 'SL-99120' };
  assert.equal(gate(sealed, 'pickup').satisfied, true, 'photos + seal unlocks');
  assert.equal(advance(sealed, 'pickup').step, 'load');

  // Whitespace is not a seal number.
  assert.equal(gate({ ...photos, sealNo: '   ' }, 'pickup').satisfied, false);
}

// ── 2 + 3 + 4 = 9, and the seal is shot twice ────────────────────────────────

{
  const j = job();
  assert.equal(j.evidence.pickup.length, 2);
  assert.equal(j.evidence.load.length, 3);
  assert.equal(j.evidence.delivery.length, 4);
  assert.equal(TOTAL_REQUIRED_PHOTOS, 9);

  // The seal is photographed IN HAND twice — fitted at pickup, cut at delivery
  // — and those two are never collapsed. (A third shot at load pairs it with
  // the chassis no.; that one is a different shot, not a duplicate.)
  const sealSlots = (['pickup', 'load', 'delivery'] as EvidenceStep[]).flatMap(
    s => j.evidence[s].filter(x => /seal/i.test(x.label)).map(x => `${s}:${x.index}`),
  );
  assert.deepEqual(
    sealSlots,
    ['pickup:1', 'load:0', 'delivery:1'],
    'three separate seal slots on three separate steps',
  );
  assert.equal(
    j.evidence.pickup[1]?.label,
    j.evidence.delivery[1]?.label,
    'pickup and delivery are the SAME shot at two moments...',
  );
  assert.notEqual(
    j.evidence.pickup[1]?.hint,
    j.evidence.delivery[1]?.hint,
    '...told apart by their capture hints, never merged into one slot',
  );

  // Every slot is labelled and ordered — never an unlabelled grid.
  for (const step of ['pickup', 'load', 'delivery'] as EvidenceStep[]) {
    j.evidence[step].forEach((slot, i) => {
      assert.equal(slot.index, i, `${step} slot ${i} is in order`);
      assert.ok(slot.label.trim().length > 0, `${step} slot ${i} is labelled`);
      assert.match(slot.hint, /^Tap to capture/, 'blank hint invites capture');
    });
  }
}

// ── ④ Submit needs all nine ──────────────────────────────────────────────────

{
  let j = passAll(job({ status: 'in_progress', step: 'pickup' }));
  j = { ...fillStep(j, 'pickup'), sealNo: 'SL-99120' };
  j = advance(j, 'pickup');
  j = advance(fillStep(j, 'load'), 'load');
  assert.equal(j.step, 'delivery');

  throws(() => submit(j), 'delivery evidence missing');

  const done = submit(fillStep(j, 'delivery'));
  assert.equal(done.status, 'awaiting_approval');
  assert.ok(done.submittedAt, 'submittedAt is stamped');
  assert.notEqual(done.status as string, 'done', 'a driver can never set DONE');

  // Deleting a photo re-opens the step and demotes the job.
  const reopened = deletePhoto(done, 'delivery', 0);
  assert.equal(reopened.status, 'in_progress', 'evidence and status cannot disagree');
  assert.equal(reopened.submittedAt, null);
  assert.equal(reopened.evidence.delivery[0]?.uri, null);
  assert.equal(gate(reopened, 'delivery').satisfied, false, 'button re-locks');
  assert.match(reopened.evidence.delivery[0]?.hint ?? '', /^Tap to capture/);

  throws(() => deletePhoto(reopened, 'delivery', 0), 'empty slot has no photo');
}

// ── Order and derived state ──────────────────────────────────────────────────

{
  const j = passAll(job({ status: 'in_progress', step: 'load' }));
  throws(() => advance(j, 'pickup' as JobStep), 'steps cannot be taken out of order');
}

assert.equal(
  isOverdue({ dueAt: '2026-08-26T00:00:00Z', status: 'in_progress' }, new Date('2026-08-27T00:00:00Z')),
  true,
);
assert.equal(
  isOverdue({ dueAt: '2026-08-26T00:00:00Z', status: 'done' }, new Date('2026-08-27T00:00:00Z')),
  false,
  'a done job is never overdue',
);
assert.equal(isDueToday({ dueAt: '2026-08-27T22:00:00Z', status: 'pending' }, '2026-08-27'), true);
assert.equal(isDueToday({ dueAt: '2026-08-27T22:00:00Z', status: 'done' }, '2026-08-27'), false);

console.log('jobStateMachine: all invariants hold');
