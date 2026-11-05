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
