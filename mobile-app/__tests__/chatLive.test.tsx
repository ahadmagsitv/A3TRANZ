/**
 * The chat screen's live subscription once sat INSIDE the `openNotes`
 * callback — syntactically legal, so tsc and every other test passed, but the
 * effect never ran. A message sent from the web only appeared after leaving
 * the thread and coming back, because that is what re-triggered `useAsync`.
 *
 * This pins the behaviour rather than the placement: fire a live `message`
 * event and the screen must refetch on its own.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { JobChatScreen } from '../src/features/chat/screens/JobChatScreen';
import { chatRepo, subscribeLive } from '../src/data/repos';
import type { LiveEvent } from '../src/data/http/live';
import type { AppStackParamList } from '../src/navigation/types';

/** `mock`-prefixed so jest allows the factory below to close over it. */
const mockListeners = new Set<(e: LiveEvent) => void>();
/** Stands in for the server pushing a nudge down the socket. */
const mockEmit = (e: LiveEvent): void => mockListeners.forEach(l => l(e));

jest.mock('../src/data/repos', () => ({
  __esModule: true,
  subscribeLive: jest.fn(l => {
    mockListeners.add(l);
    return () => mockListeners.delete(l);
  }),
  chatRepo: {
    markThreadRead: jest.fn(async () => undefined),
    threads: jest.fn(async () => [
      { id: 't1', jobId: 'j1', jobTitle: 'Job', adminLabel: 'Dispatch', unread: false },
    ]),
    messages: jest.fn(async () => []),
    send: jest.fn(),
  },
}));

const Stack = createNativeStackNavigator<AppStackParamList>();

const Harness = () => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 393, height: 852 },
      insets: { top: 54, left: 0, right: 0, bottom: 34 },
    }}
  >
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="JobChat"
          component={JobChatScreen}
          initialParams={{ threadId: 't1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  </SafeAreaProvider>
);

afterEach(() => mockListeners.clear());

it('refetches the thread when a message arrives, without navigating away', async () => {
  render(<Harness />);
  await waitFor(() => expect(chatRepo.messages).toHaveBeenCalledTimes(1));

  // The screen must have registered a listener at all — the original bug.
  expect(subscribeLive).toHaveBeenCalled();

  await act(async () => mockEmit({ type: 'message' }));

  await waitFor(() => expect(chatRepo.messages).toHaveBeenCalledTimes(2));
});
