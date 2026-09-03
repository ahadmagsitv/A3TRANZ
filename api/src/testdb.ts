/**
 * Every test file starts from the seeded dataset.
 *
 * The database is chosen by the `test` script, not here: it exports
 * `DATABASE_URL` pointing at a separate `_test` database before Node starts,
 * so no module can connect to the wrong one no matter what order the imports
 * happen to evaluate in. Tests TRUNCATE on every reseed — pointed at the dev
 * database, `npm test` silently destroys whatever you were testing by hand.
 * That happened; hence the separation.
 *
 * A subprocess rather than an import because `seed.ts` is a top-level script
 * that ends by closing the pool; importing it would take the test's pool with
 * it. It inherits this process's `DATABASE_URL`, which is the point.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error(
    'tests must run against a _test database — use `npm test`, which sets it',
  );
}

export const reseed = (): void => {
  execFileSync(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(new URL('seed.ts', import.meta.url))],
    { stdio: 'ignore' },
  );
};
