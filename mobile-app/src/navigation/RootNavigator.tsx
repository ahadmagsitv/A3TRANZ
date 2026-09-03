import React, { useCallback, useEffect } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  LoginScreen,
  ResetPasswordScreen,
  SplashScreen,
} from '../features/auth';
import {
  AttachmentsScreen,
  JobDetailScreen,
  UploadWorkScreen,
} from '../features/jobs';
import {
  CaptureStepScreen,
  PreTripInspectionScreen,
  SubmittedScreen,
} from '../features/capture';
import { JobChatScreen, JobNotesScreen } from '../features/chat';
import { EarningsScreen, StatementDetailScreen } from '../features/earnings';
import {
  ChangePasswordScreen,
  ContactInfoScreen,
  JobHistoryScreen,
  NotificationSettingsScreen,
} from '../features/profile';
import { onSessionEnded } from '../data/api';
import { chatRepo } from '../data/repos';
import { initialPushTap, onPushTap, type PushTap } from '../push';
import { colors } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { TabNavigator } from './TabNavigator';
import type {
  AppStackParamList,
  AuthStackParamList,
  RootStackParamList,
} from './types';

const Root = createNativeStackNavigator<RootStackParamList>();
const Auth = createNativeStackNavigator<AuthStackParamList>();
const App = createNativeStackNavigator<AppStackParamList>();

const navTheme: Theme = {
  dark: false,
  colors: {
    primary: colors.sel,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.hairline,
    notification: colors.stOverdue,
  },
  fonts: {
    regular: { fontFamily: fonts.text[400], fontWeight: '400' },
    medium: { fontFamily: fonts.text[500], fontWeight: '400' },
    bold: { fontFamily: fonts.text[700], fontWeight: '400' },
    heavy: { fontFamily: fonts.display[800], fontWeight: '400' },
  },
};

/**
 * M1 → M2 → M3. Renders without the tab bar.
 *
 * Splash `replace`s itself with Login so the launch frame is never on the back
 * stack, and M3 draws its own `.topbar` `chevron-left` rather than a native
 * header (§6.4).
 */
const AuthStack = (): React.JSX.Element => (
  <Auth.Navigator screenOptions={{ headerShown: false }}>
    <Auth.Screen name="Splash" component={SplashScreen} />
    <Auth.Screen name="Login" component={LoginScreen} />
    <Auth.Screen name="ResetPassword" component={ResetPasswordScreen} />
  </Auth.Navigator>
);

/**
 * The tab shell plus every pushed screen. Headers are off: the design draws its
 * own `.topbar` inside `.scr`, absorbing the status bar in its 50px top padding
 * (§6.4), so a native header would double it.
 */
const AppStack = (): React.JSX.Element => (
  <App.Navigator screenOptions={{ headerShown: false }}>
    <App.Screen name="Tabs" component={TabNavigator} />
    <App.Screen name="JobDetail" component={JobDetailScreen} />
    <App.Screen name="Attachments" component={AttachmentsScreen} />
    <App.Screen name="UploadWork" component={UploadWorkScreen} />
    {/* M19 → M20 → M21 → M22 → M23. Steps ②③④ are one screen behind three
        route names: the frame is identical and the differences are data the
        state machine already owns (slot count, labels, gate). */}
    <App.Screen name="PreTripInspection" component={PreTripInspectionScreen} />
    <App.Screen name="ConfirmPickup" component={CaptureStepScreen} />
    <App.Screen name="ConfirmLoad" component={CaptureStepScreen} />
    <App.Screen name="ConfirmDelivery" component={CaptureStepScreen} />
    <App.Screen name="Submitted" component={SubmittedScreen} />
    {/* M27 → M12 → M13. M13's only inbound edge is M12's `.chat-ctx`. */}
    <App.Screen name="JobChat" component={JobChatScreen} />
    <App.Screen name="JobNotes" component={JobNotesScreen} />
    {/* Earnings is NOT a tab (§4.1) — pushed from M18's card and M15's row. */}
    <App.Screen name="Earnings" component={EarningsScreen} />
    <App.Screen name="StatementDetail" component={StatementDetailScreen} />
    {/* M15 → M16 / M17. Both are pushes, both back out to the Profile tab. */}
    <App.Screen name="ChangePassword" component={ChangePasswordScreen} />
    <App.Screen name="JobHistory" component={JobHistoryScreen} />
    {/* M15's Contact info / Notification settings rows — no source frame,
        no data-goto edge; built to the app's own shape once asked for. */}
    <App.Screen name="ContactInfo" component={ContactInfoScreen} />
    <App.Screen
      name="NotificationSettings"
      component={NotificationSettingsScreen}
    />
  </App.Navigator>
);

/**
 * auth stack | app tabs.
 *
 * The session check lives on M1, not here: `.scr` says "SYNCING JOBS" and that
 * is literally what it does — `authRepo.current()` resolves while the splash
 * animates, then it `reset`s to App or `replace`s to Login. Both branches stay
 * mounted so the reset in either direction is a plain root dispatch.
 */
export const RootNavigator = (): React.JSX.Element => {
  const nav = useNavigationContainerRef<RootStackParamList>();

  /**
   * A session that dies mid-shift takes the driver back to sign-in.
   *
   * The check that matters is server-side and it fires on whatever call the
   * driver happens to make — so this listens to the api client rather than
   * polling, and resets rather than navigating: the job they were half way
   * through must not be sitting on the back stack for the next person who
   * signs in on that phone.
   */
  /**
   * A tapped push opens what it is about: a message goes to its thread, a job
   * event to the job. The payload carries only `{kind, jobId}` — the screen
   * fetches the rest, so there is one path for reading a job either way.
   */
  const openTap = useCallback(
    async (tap: PushTap) => {
      if (!nav.isReady() || !tap.jobId) {
        return;
      }
      if (tap.kind === 'message') {
        const thread = (await chatRepo.threads()).find(t => t.jobId === tap.jobId);
        if (thread) {
          nav.navigate('App', {
            screen: 'JobChat',
            params: {threadId: thread.id},
          } as never);
        }
        return;
      }
      nav.navigate('App', {
        screen: 'JobDetail',
        params: {jobId: tap.jobId},
      } as never);
    },
    [nav],
  );

  // Launched by a notification from a killed state, and tapped while running.
  useEffect(() => {
    void initialPushTap().then(tap => (tap ? openTap(tap) : undefined));
    return onPushTap(tap => void openTap(tap));
  }, [openTap]);

  useEffect(
    () =>
      onSessionEnded(() => {
        if (nav.isReady()) {
          nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
        }
      }),
    [nav],
  );

  return (
    <NavigationContainer theme={navTheme} ref={nav}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        <Root.Screen name="Auth" component={AuthStack} />
        <Root.Screen name="App" component={AppStack} />
      </Root.Navigator>
    </NavigationContainer>
  );
};
