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

  fireEvent.changeText(screen.getByLabelText('Email'), 'driver@a3transport.com');
  const password = screen.getByLabelText('Password');
  const staleOnSubmitEditing = password.props.onSubmitEditing;

  fireEvent.changeText(password, 'wrong-but-long-enough');
  await act(async () => {
    await staleOnSubmitEditing({} as never);
  });

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

  fireEvent.changeText(screen.getByLabelText('Email'), 'driver@a3transport.com');
  const password = screen.getByLabelText('Password');
  fireEvent.changeText(password, 'short');
  await act(async () => {
    await password.props.onSubmitEditing({} as never);
  });

  expect(screen.queryAllByText(/at least 8 characters/i).length).toBeGreaterThan(0);
});

test('empty fields show required messages and never call sign-in', async () => {
  render(<Harness />);

  await act(async () => {
    await screen.getByLabelText('Password').props.onSubmitEditing({} as never);
  });

  expect(screen.queryAllByText('Email address is required').length).toBe(1);
  expect(screen.queryAllByText('Password is required').length).toBe(1);
  expect(screen.queryAllByText(/incorrect email or password/i).length).toBe(0);
});
