import { authRepo } from '../src/data/mock';
import { AuthError } from '../src/data/contracts';
import fixtures from '../src/data/fixtures.json';

const { email, password } = fixtures.auth;

const failure = async (fn: Promise<unknown>): Promise<AuthError> => {
  try {
    await fn;
  } catch (e) {
    if (e instanceof AuthError) {
      return e;
    }
    throw e;
  }
  throw new Error('expected an AuthError, got a resolved promise');
};

afterEach(() => authRepo.signOut());

describe('M2 · login', () => {
  it('signs in the fixture driver', async () => {
    const session = await authRepo.signIn(email, password);
    expect(session.driver.email).toBe(email);
    expect(await authRepo.current()).not.toBeNull();
  });

  it('rejects a short password with a field-scoped error', async () => {
    const e = await failure(authRepo.signIn(email, 'short'));
    expect(e.code).toBe('password_too_short');
    expect(e.field).toBe('password');
  });

  it('rejects wrong credentials without a field', async () => {
    const e = await failure(authRepo.signIn(email, 'wrongpassword'));
    expect(e.code).toBe('invalid_credentials');
    expect(e.field).toBeUndefined();
  });

  it('leaves no session behind after a failed sign-in', async () => {
    await failure(authRepo.signIn(email, 'short'));
    expect(await authRepo.current()).toBeNull();
  });
});

describe('M3 · reset password', () => {
  it('returns the copy M3-link-sent renders', async () => {
    const sent = await authRepo.requestReset(email);
    expect(sent.sentTo).toBe(email);
    expect(sent.expiryLabel).toBe(fixtures.auth.resetExpiryLabel);
  });

  it('rejects an unknown email onto the email field', async () => {
    const e = await failure(authRepo.requestReset('nobody@example.com'));
    expect(e.code).toBe('unknown_email');
    expect(e.field).toBe('email');
  });
});
