/**
 * A3TRANZ — Driver Mobile App
 *
 * @format
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';

/**
 * The design is light-only — there is no dark artboard and inventing one is
 * scope creep. `.sbar` is dark ink on `--bg`, so the bar style is fixed.
 */
function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
