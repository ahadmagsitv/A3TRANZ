/**
 * The leg-split validator (IMPLEMENTATION_PLAN §6.9).
 *
 * Legs — Pickup / Loading / Delivery — each carry their own amount and their
 * own driver: one job can pay three different people. They must total the job
 * price, and a mismatch states the numbers rather than saying "invalid".
 *
 * Both strings below are verbatim from `W4-validation-error`. They live here,
 * not in the web form, so the API's refusal and the form's inline error are
 * the same sentence — a second copy in a route handler would drift the day
 * someone reworded one of them.
 *
 * Arithmetic is in INTEGER CENTS. Summing dollars as floats is how
 * 40 + 40 + 40 becomes 119.99999999999999 and a valid split gets rejected.
 */
import type { LegKind } from './contracts/jobs.ts';

export class LegSplitError extends Error {
  readonly legsTotalCents: number;
  readonly priceCents: number;
  /** The `.errmsg` line rendered under the leg rows. */
  readonly inline: string;

  constructor(legsTotalCents: number, priceCents: number, message: string, inline: string) {
    super(message);
    this.name = 'LegSplitError';
    this.legsTotalCents = legsTotalCents;
    this.priceCents = priceCents;
    this.inline = inline;
  }
}

/** '$130.00' — always two decimals, always from cents. */
export const money = (cents: number): string =>
  `$${(Math.abs(cents) / 100).toFixed(2)}`;

export interface LegAmount {
  kind: LegKind;
  amountCents: number;
}

/**
 * Throws unless the legs total the price exactly. Returns nothing — it is a
 * guard, not a calculator; nothing here silently adjusts an amount to fit.
 */
export const validateLegSplit = (
  legs: readonly LegAmount[],
  priceCents: number,
): void => {
  if (legs.length === 0) {
    throw new LegSplitError(
      0,
      priceCents,
      'A job needs at least one leg before it can be created.',
      'Add a Pickup, Loading or Delivery leg.',
    );
  }

  for (const leg of legs) {
    if (!Number.isInteger(leg.amountCents) || leg.amountCents < 0) {
      throw new LegSplitError(
        0,
        priceCents,
        `The ${leg.kind} leg has an invalid amount.`,
        'Leg amounts cannot be negative.',
      );
    }
  }

  const seen = new Set<LegKind>();
  for (const leg of legs) {
    if (seen.has(leg.kind)) {
      throw new LegSplitError(
        0,
        priceCents,
        `This job has two ${leg.kind} legs.`,
        'Each leg can appear only once.',
      );
    }
    seen.add(leg.kind);
  }

  const total = legs.reduce((n, l) => n + l.amountCents, 0);
  if (total === priceCents) return;

  const diff = total - priceCents;
  throw new LegSplitError(
    total,
    priceCents,
    `Legs total ${money(total)} but the job price is ${money(priceCents)} — they must match before you can create the job.`,
    `${money(diff)} ${diff > 0 ? 'over-allocated' : 'under-allocated'} across the ${
      legs.length === 1 ? 'leg' : `${legs.length === 2 ? 'two' : 'three'} legs`
    }.`,
  );
};
