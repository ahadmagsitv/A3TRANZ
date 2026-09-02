import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * The five fixed tabs — Home · Jobs · Alerts · Chat · Profile (§4.1).
 * Earnings is NOT a tab: it is reached from the Home card and a Profile row.
 */
export type TabParamList = {
  Home: undefined;
  Jobs: undefined;
  Alerts: undefined;
  Chat: undefined;
  Profile: undefined;
};

export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  ResetPassword: undefined;
};

/**
 * Every non-root screen is a stack push with a `chevron-left` back button.
 * Phase 1+ fills these in; the names come from the demo flow graph.
 */
export type AppStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  JobDetail: { jobId: string };
  Attachments: { jobId: string };
  UploadWork: { jobId: string };
  PreTripInspection: { jobId: string };
  ConfirmPickup: { jobId: string };
  ConfirmLoad: { jobId: string };
  ConfirmDelivery: { jobId: string };
  Submitted: { jobId: string };
  JobChat: { threadId: string };
  JobNotes: { jobId: string };
  Earnings: undefined;
  StatementDetail: { periodId: string };
  ChangePassword: undefined;
  JobHistory: undefined;
  ContactInfo: undefined;
  NotificationSettings: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppStackParamList>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
