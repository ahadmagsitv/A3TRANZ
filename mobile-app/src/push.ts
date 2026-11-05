import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import type {RemoteMessage} from '@react-native-firebase/messaging';
import {registerDevice, unregisterDevice} from './data/http/pushTokens';

let current: string | null = null;

export const startPush = async (): Promise<() => void> => {
  try {
    const app = getMessaging();
    const status = await requestPermission(app);
    const granted =
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL;
    if (!granted) {
      return () => {};
    }

    const token = await getToken(app);
    current = token;
    await registerDevice(token);

    const off = onTokenRefresh(app, async (next: string) => {
      current = next;
      await registerDevice(next).catch(() => {});
    });
    return off;
  } catch {
    return () => {};
  }
};

export const stopPush = async (): Promise<void> => {
  if (!current) {
    return;
  }
  const token = current;
  current = null;
  await unregisterDevice(token).catch(() => {});
};

export interface PushTap {
  kind?: string;
  jobId?: string;
  threadId?: string;
}

export const initialPushTap = async (): Promise<PushTap | null> => {
  try {
    const opened = await getInitialNotification(getMessaging());
    return (opened?.data as PushTap) ?? null;
  } catch {
    return null;
  }
};

export const onPushTap = (fn: (t: PushTap) => void): (() => void) => {
  try {
    return onNotificationOpenedApp(getMessaging(), (m: RemoteMessage) =>
      fn((m.data ?? {}) as PushTap),
    );
  } catch {
    return () => {};
  }
};

export const onForegroundPush = (
  fn: (t: PushTap & {title?: string; body?: string}) => void,
): (() => void) => {
  try {
    return onMessage(getMessaging(), (m: RemoteMessage) =>
      fn({
        ...((m.data ?? {}) as PushTap),
        title: m.notification?.title,
        body: m.notification?.body,
      }),
    );
  } catch {
    return () => {};
  }
};
