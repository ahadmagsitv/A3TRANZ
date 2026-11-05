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
