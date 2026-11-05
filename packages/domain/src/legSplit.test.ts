import assert from 'node:assert/strict';
import { LegSplitError, money, validateLegSplit } from './legSplit.ts';

const legs = (...c: number[]) =>
  c.map((amountCents, i) => ({
    kind: (['pickup', 'loading', 'delivery'] as const)[i]!,
    amountCents,
  }));

validateLegSplit(legs(4000, 4000, 4000), 12000);
validateLegSplit(legs(12000), 12000);

assert.throws(
  () => validateLegSplit(legs(4000, 4500, 4500), 12000),
  (e: unknown) => {
    assert.ok(e instanceof LegSplitError);
    assert.equal(
      e.message,
      'Legs total $130.00 but the job price is $120.00 — they must match before you can create the job.',
    );
    assert.equal(e.inline, '$10.00 over-allocated across the three legs.');
    return true;
  },
);

assert.throws(
  () => validateLegSplit(legs(4000, 4000, 3000), 12000),
  (e: unknown) => {
    assert.ok(e instanceof LegSplitError);
    assert.match(e.inline, /^\$10\.00 under-allocated/);
    return true;
  },
);

assert.throws(() => validateLegSplit(legs(1333, 1333, 1333), 4000), LegSplitError);
validateLegSplit(legs(1333, 1333, 1334), 4000);

assert.throws(() => validateLegSplit([], 12000), LegSplitError);
assert.throws(() => validateLegSplit(legs(-100, 12100), 12000), LegSplitError);
assert.throws(
  () =>
    validateLegSplit(
      [
        { kind: 'pickup', amountCents: 6000 },
        { kind: 'pickup', amountCents: 6000 },
      ],
      12000,
    ),
  LegSplitError,
);

assert.equal(money(0), '$0.00');
assert.equal(money(-1000), '$10.00', 'the sign is carried by the wording, not the figure');
assert.equal(money(199), '$1.99');

console.log('legSplit: §6.9 copy and arithmetic hold');
