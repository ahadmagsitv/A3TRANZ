import React from 'react';
import { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChangePasswordScreen } from '../src/features/profile/screens/ChangePasswordScreen';
import type { AppStackParamList } from '../src/navigation/types';

const Stack = createNativeStackNavigator<AppStackParamList>();

function Harness() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 54, left: 0, right: 0, bottom: 34 },
      }}
    >
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const CURRENT = 'a3transport';
const NEXT = 'newpassword1';

const type = (label: string, value: string): void => {
  fireEvent.changeText(screen.getByLabelText(label), value);
};

test('a stale onSubmitEditing held from before the last keystroke still sees the full confirmation', async () => {
  render(<Harness />);

  type('Current password', CURRENT);
  type('New password', NEXT);

  const confirm = screen.getByLabelText('Confirm new password');
  const staleOnSubmitEditing = confirm.props.onSubmitEditing;
  fireEvent.changeText(confirm, NEXT);

  await act(async () => {
    await staleOnSubmitEditing({} as never);
  });

  const sawMismatch = screen.queryAllByText(/do not match/i).length > 0;
  const sawSuccess = screen.queryAllByText(/password updated/i).length > 0;
  expect({ sawMismatch, sawSuccess }).toEqual({
    sawMismatch: false,
    sawSuccess: true,
  });
});

test('a genuine mismatch is still rejected before the repo is called', async () => {
  render(<Harness />);

  type('Current password', CURRENT);
  type('New password', NEXT);
  type('Confirm new password', 'newpassword2');

  await act(async () => {
    await screen
      .getByLabelText('Confirm new password')
      .props.onSubmitEditing({} as never);
  });

  expect(screen.queryAllByText(/do not match/i).length).toBeGreaterThan(0);
});

test('a wrong current password comes back on the current-password field', async () => {
  render(<Harness />);

  type('Current password', 'not-my-password');
  type('New password', NEXT);
  type('Confirm new password', NEXT);

  await act(async () => {
    await screen
      .getByLabelText('Confirm new password')
      .props.onSubmitEditing({} as never);
  });

  expect(
    screen.queryAllByText(/current password is incorrect/i).length,
  ).toBeGreaterThan(0);
});
