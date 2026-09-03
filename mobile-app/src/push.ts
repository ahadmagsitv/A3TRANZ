/**
 * Push notifications.
 *
 * The payload is only a nudge with `{kind, jobId}` — the app refetches through
 * the normal repo call when it opens the screen, so nothing sensitive travels
 * through Firebase and there is one code path for reading a job or a thread.
 *
 * Everything here fails soft. A driver who declines the permission, or a build
 * without APNs configured, must still get a working app; push is an extra on
 * top of the Alerts tab, which is the actual record.
 */
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import type {RemoteMessage} from '@react-native-firebase/messaging';
import {registerDevice, unregisterDevice} from './data/http/pushTokens';

let current: string | null = null;

/**
 * Ask once, register, and keep the token fresh.
 *
 * Called after sign-in — a token registered before there is a session would
 * have nobody to belong to.
 */
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

    // FCM rotates tokens; an unregistered rotation means silence.
    const off = onTokenRefresh(app, async (next: string) => {
      current = next;
      await registerDevice(next).catch(() => {});
    });
    return off;
  } catch {
    // No Firebase in this build, or no APNs entitlement. The app is fine.
    return () => {};
  }
};

/** Signing out stops push for THIS device only. */
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
}

/**
 * A notification the driver tapped, if the app was opened by one. Covers both
 * cases: opened from the background, and launched cold from a killed state.
 */
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
