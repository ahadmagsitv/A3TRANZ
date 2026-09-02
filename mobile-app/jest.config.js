module.exports = {
  preset: '@react-native/jest-preset',
  // The preset's roots default to <rootDir>, which sweeps in node_modules'
  // own test files and ios/Pods snapshots. Only our tests are ours to run.
  roots: ['<rootDir>/__tests__', '<rootDir>/__mocks__'],
  // Screens import their repos from `data/repos`, which is the API. Tests run
  // those same screens against the deterministic fixtures instead — a unit
  // test asserting a state-machine gate should not need a live Postgres.
  moduleNameMapper: {
    '^(.*)/data/repos$': '$1/data/mock',
  },
  // The navigation, icon and WebView packages ship ESM (.mjs). The preset's
  // transform only covers js/ts/tsx and ignores every node_module that is not
  // react-native's own, so both lists need widening or Metro-shaped packages
  // blow up with "Unexpected token 'export'" under Jest.
  transform: {
    '^.+\\.(js|mjs|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?' +
      '|@react-navigation|react-native-screens|react-native-safe-area-context' +
      '|react-native-svg|react-native-webview|react-native-image-picker' +
      '|lucide-react-native|@react-native-async-storage)/)',
  ],
};
