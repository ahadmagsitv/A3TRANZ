/**
 * There is no Firebase native module under Jest, and there should not be —
 * these tests assert screens and state machines, not push delivery.
 *
 * `src/push.ts` already fails soft (a driver who declines the permission still
 * gets a working app), so this only has to be importable. Every call resolves
 * to "no permission", which is the path that changes nothing.
 */
const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
};

module.exports = {
  __esModule: true,
  AuthorizationStatus,
  getMessaging: () => ({}),
  requestPermission: async () => AuthorizationStatus.DENIED,
  getToken: async () => 'test-token',
  onTokenRefresh: () => () => {},
  getInitialNotification: async () => null,
  onNotificationOpenedApp: () => () => {},
};
