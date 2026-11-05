import type { NavigatorScreenParams } from '@react-navigation/native';

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
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
