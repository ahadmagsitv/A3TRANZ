/**
 * Every test file starts from the seeded dataset.
 *
 * Without this the suite only passes in one order and only once: `admin.test`
 * creates jobs, then `reads.test` asserts the seeded count of 11 and sees 13.
 * Reseeding per file — not just once before the chain — is what makes a single
 * file runnable on its own, which is how you debug one.
 *
 * A subprocess rather than an import because `seed.ts` is a top-level script
 * that ends by closing the pool; importing it would take the test's pool with
 * it. Spawning costs ~1s per file and needs no change to seed.ts.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const reseed = (): void => {
  execFileSync(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(new URL('seed.ts', import.meta.url))],
    { stdio: 'ignore' },
  );
};
