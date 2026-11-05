module.exports = {
  preset: '@react-native/jest-preset',
  roots: ['<rootDir>/__tests__', '<rootDir>/__mocks__'],
  moduleNameMapper: {
    '^(.*)/data/repos$': '$1/data/mock',
  },
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
