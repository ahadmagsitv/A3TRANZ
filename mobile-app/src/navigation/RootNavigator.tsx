import React, { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
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
import {
  initialPushTap,
  onForegroundPush,
  onPushTap,
  type PushTap,
} from '../push';
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

const AuthStack = (): React.JSX.Element => (
  <Auth.Navigator screenOptions={{ headerShown: false }}>
    <Auth.Screen name="Splash" component={SplashScreen} />
    <Auth.Screen name="Login" component={LoginScreen} />
    <Auth.Screen name="ResetPassword" component={ResetPasswordScreen} />
  </Auth.Navigator>
);

const AppStack = (): React.JSX.Element => (
  <App.Navigator screenOptions={{ headerShown: false }}>
    <App.Screen name="Tabs" component={TabNavigator} />
    <App.Screen name="JobDetail" component={JobDetailScreen} />
    <App.Screen name="Attachments" component={AttachmentsScreen} />
    <App.Screen name="UploadWork" component={UploadWorkScreen} />
    <App.Screen name="PreTripInspection" component={PreTripInspectionScreen} />
    <App.Screen name="ConfirmPickup" component={CaptureStepScreen} />
    <App.Screen name="ConfirmLoad" component={CaptureStepScreen} />
    <App.Screen name="ConfirmDelivery" component={CaptureStepScreen} />
    <App.Screen name="Submitted" component={SubmittedScreen} />
    <App.Screen name="JobChat" component={JobChatScreen} />
    <App.Screen name="JobNotes" component={JobNotesScreen} />
    <App.Screen name="Earnings" component={EarningsScreen} />
    <App.Screen name="StatementDetail" component={StatementDetailScreen} />
    <App.Screen name="ChangePassword" component={ChangePasswordScreen} />
    <App.Screen name="JobHistory" component={JobHistoryScreen} />
    <App.Screen name="ContactInfo" component={ContactInfoScreen} />
    <App.Screen
      name="NotificationSettings"
      component={NotificationSettingsScreen}
    />
  </App.Navigator>
);

export const RootNavigator = (): React.JSX.Element => {
  const nav = useNavigationContainerRef<RootStackParamList>();

  const openTap = useCallback(
    async (tap: PushTap) => {
      if (!nav.isReady()) {
        return;
      }
      if (tap.kind === 'message') {
        const threadId =
          tap.threadId ??
          (tap.jobId
            ? (await chatRepo.threads()).find(t => t.jobId === tap.jobId)?.id
            : undefined);
        if (threadId) {
          nav.navigate('App', {
            screen: 'JobChat',
            params: {threadId},
          } as never);
        }
        return;
      }
      if (!tap.jobId) {
        return;
      }
      nav.navigate('App', {
        screen: 'JobDetail',
        params: {jobId: tap.jobId},
      } as never);
    },
    [nav],
  );

  useEffect(() => {
    void initialPushTap().then(tap => (tap ? openTap(tap) : undefined));
    return onPushTap(tap => void openTap(tap));
  }, [openTap]);

  useEffect(
    () =>
      onForegroundPush(tap => {
        if (tap.kind !== 'message' || !nav.isReady()) {
          return;
        }
        const route = nav.getCurrentRoute();
        const params = route?.params as { threadId?: string } | undefined;
        if (route?.name === 'JobChat' && params?.threadId === tap.threadId) {
          return;
        }
        Alert.alert(tap.title ?? 'New message', tap.body ?? '', [
          { text: 'Dismiss', style: 'cancel' },
          { text: 'Open', onPress: () => void openTap(tap) },
        ]);
      }),
    [nav, openTap],
  );

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
