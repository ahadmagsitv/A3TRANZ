import { AuthError, type AuthRepo, type Session } from '../contracts';
import { clone, db, delay, MockError } from './db';

const sessionFor = (driverId: string): Session => {
  const driver = db.drivers.find(d => d.id === driverId);
  if (!driver) {
    throw new MockError(`No driver ${driverId}.`);
  }
  return { driver: clone(driver), token: `mock-${driverId}` };
};

export const mockAuthRepo: AuthRepo = {
  async signIn(email: string, password: string) {
    await delay();
    // M2-error is reachable from the mock, not hand-placed on the screen.
    if (password.trim().length < 8) {
      throw new AuthError(
        'password_too_short',
        'Password must be at least 8 characters.',
        'password',
      );
    }
    if (
      email.trim().toLowerCase() !== db.credentials.email ||
      password !== db.credentials.password
    ) {
      throw new AuthError(
        'invalid_credentials',
        'Incorrect email or password.',
      );
    }
    const session = sessionFor(db.credentials.driverId);
    db.session = { driverId: session.driver.id, token: session.token };
    return session;
  },

  async signOut() {
    await delay();
    db.session = null;
  },

  async current() {
    await delay();
    return db.session ? sessionFor(db.session.driverId) : null;
  },

  async requestReset(email: string) {
    await delay();
    if (email.trim().toLowerCase() !== db.credentials.email) {
      throw new AuthError(
        'unknown_email',
        'We could not find an account with that email.',
        'email',
      );
    }
    return {
      sentTo: db.credentials.email,
      expiryLabel: db.credentials.resetExpiryLabel,
    };
  },
};
