/**
 * Telling the server where to push.
 *
 * The FCM token identifies the DEVICE, not the account, so it is registered
 * after sign-in and dropped on sign-out — otherwise a shared phone keeps
 * buzzing for whoever used it last. The server keys on the token for the same
 * reason.
 */
import {api} from '../api';
import {Platform} from 'react-native';

export const registerDevice = async (token: string): Promise<void> => {
  await api<void>('/notifications/device', {
    method: 'POST',
    body: {token, platform: Platform.OS === 'android' ? 'android' : 'ios'},
  });
};

export const unregisterDevice = async (token: string): Promise<void> => {
  await api<void>(`/notifications/device/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
};
