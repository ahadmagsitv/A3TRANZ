/**
 * Regression for a real bug found walking M2 on-device: the keyboard's "Go"
 * key can fire onSubmitEditing on the TextInput's CURRENT prop reference —
 * which native holds onto until the next commit — one tick before the final
 * onChangeText's setState has re-rendered and rebuilt `submit`'s closure.
 * `LoginScreen` used to read `password` straight from that stale closure and
 * threw `password_too_short` on a perfectly valid password, succeeding only
 * on the next press. Fixed by reading a ref that updates synchronously with
 * the keystroke instead of the closed-over state.
 *
 * To reproduce the exact race (not just "does the final state work"), this
 * test captures the `onSubmitEditing` reference BEFORE the last keystroke —
 * exactly what native would still be holding — and invokes that stale
 * reference after the state update, rather than letting RTL re-look-up the
 * current (already-fresh) prop.
 *
 * The probe password is wrong-but-long-enough (>=8 chars) on purpose: it
 * isolates the race from sign-in's success path (navigation reset), so the
 * only question under test is *which validation error the mock sees* — the
 * length check firing on a full-length password is exactly the bug. The
 * assertion runs synchronously right after the awaited `act()` — the async
 * chain is already fully settled by then, so no `waitFor` polling is needed.
 */
import React from 'react';
import { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from '../src/features/auth/screens/LoginScreen';
import type { AuthStackParamList } from '../src/navigation/types';

const Auth = createNativeStackNavigator<AuthStackParamList>();

function Harness() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 54, left: 0, right: 0, bottom: 34 },
      }}
    >
      <NavigationContainer>
        <Auth.Navigator screenOptions={{ headerShown: false }}>
          <Auth.Screen name="Login" component={LoginScreen} />
        </Auth.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

test('a stale onSubmitEditing reference held from before the last keystroke still sees the full password', async () => {
  render(<Harness />);

  const password = screen.getByLabelText('Password');
  // The reference native would still be holding a tick before the state
  // update from the final keystroke lands — captured BEFORE that update,
  // not re-looked-up afterward.
  const staleOnSubmitEditing = password.props.onSubmitEditing;

  fireEvent.changeText(password, 'wrong-but-long-enough'); // 22 chars, wrong
  await act(async () => {
    await staleOnSubmitEditing({} as never);
  });

  // The RIGHT error: the mock saw the full 22-char string and rejected it as
  // incorrect, not as short. Compare booleans, not queried elements — Jest's
  // failure-diff pretty-printer for a found host element is unrelated noise
  // this test doesn't need to pay for.
  const sawWrongCredentialsError =
    screen.queryAllByText(/incorrect email or password/i).length > 0;
  const sawTooShortError =
    screen.queryAllByText(/at least 8 characters/i).length > 0;
  expect({ sawWrongCredentialsError, sawTooShortError }).toEqual({
    sawWrongCredentialsError: true,
    sawTooShortError: false,
  });
});

test('a genuinely short password still shows the field error', async () => {
  render(<Harness />);

  const password = screen.getByLabelText('Password');
  fireEvent.changeText(password, 'short');
  await act(async () => {
    await password.props.onSubmitEditing({} as never);
  });

  expect(screen.queryAllByText(/at least 8 characters/i).length).toBeGreaterThan(0);
});
