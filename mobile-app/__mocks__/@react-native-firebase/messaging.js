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
