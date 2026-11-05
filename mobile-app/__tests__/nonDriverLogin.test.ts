import { httpAuthRepo } from '../src/data/http/auth';
import { token } from '../src/data/api';
import { AuthError } from '../src/data/contracts';

const reply = (status: number, body: unknown): Response =>
  ({ status, ok: status < 400, json: async () => body }) as Response;

afterEach(() => {
  token.set(null);
  jest.restoreAllMocks();
});

it('rejects an office account by name and keeps no token', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) =>
    String(input).includes('/auth/login')
      ? reply(200, { token: 'real-token', user: { id: 'u1' } })
      : reply(404, { code: 'not_found', message: 'Not found.' }),
  );

  await expect(httpAuthRepo.signIn('admin@a3tranz.com', 'Password@123'))
    .rejects.toBeInstanceOf(AuthError);
  expect(token.get()).toBeNull();
});

it('names the code so the login screen has copy for it', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) =>
    String(input).includes('/auth/login')
      ? reply(200, { token: 'real-token', user: { id: 'u1' } })
      : reply(404, { code: 'not_found', message: 'Not found.' }),
  );

  const e = await httpAuthRepo
    .signIn('admin@a3tranz.com', 'Password@123')
    .catch((err: unknown) => err);
  expect((e as AuthError).code).toBe('not_a_driver');
});
