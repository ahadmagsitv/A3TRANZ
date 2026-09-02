import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Banknote,
  Bell,
  CheckCircle2,
  History,
  Lock,
  LogOut,
  User,
} from 'lucide-react-native';
import {
  Button,
  Money,
  Row,
  Sheet,
  Toast,
  Topbar,
  formatMoney,
} from '../../../components';
import { authRepo, driversRepo, payrollRepo } from '../../../data/repos';
import type { Driver, EarningsSummary } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { colors, radii, spacing, tint } from '../../../theme/tokens';
import { display, text } from '../../../theme/typography';
import type {
  AppStackParamList,
  RootStackParamList,
  TabParamList,
} from '../../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<AppStackParamList>
>;

/**
 * `M15-default` · `M15-confirm` — the Profile tab.
 *
 * The card is five `.row`s. Three are the only outbound edges the flow graph
 * gives this screen (Earnings → M24, Change password → M16, Job history →
 * M17); Contact info and Notification settings have no `data-goto` and no
 * designed frame, so both push a screen built to the app's own component
 * language (read-only rows / a settings switch list) rather than a literal
 * HTML port — there is nothing to port.
 *
 * §8 Q8 — the log-out sheet keeps the tab bar mounted behind the scrim; the
 * frame drops it, but unmounting it causes a layout jump in a real app.
 */
export const ProfileScreen = ({ navigation }: Props): React.JSX.Element => {
  const { data, error, reload } = useAsync<{
    driver: Driver;
    summary: EarningsSummary;
  }>(async () => {
    const driver = await driversRepo.me();
    const summary = await payrollRepo.summary(driver.id);
    return { driver, summary };
  }, []);

  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const askLogOut = useCallback(() => setConfirming(true), []);
  const cancelLogOut = useCallback(() => setConfirming(false), []);

  const goEarnings = useCallback(
    () => navigation.navigate('Earnings'),
    [navigation],
  );
  const goChangePassword = useCallback(
    () => navigation.navigate('ChangePassword'),
    [navigation],
  );
  const goJobHistory = useCallback(
    () => navigation.navigate('JobHistory'),
    [navigation],
  );
  const goContactInfo = useCallback(
    () => navigation.navigate('ContactInfo'),
    [navigation],
  );
  const goNotificationSettings = useCallback(
    () => navigation.navigate('NotificationSettings'),
    [navigation],
  );

  /**
   * The real sign-out: end the session in the repo, THEN reset the root back to
   * the auth stack. Resetting is what unmounts the app stack, and unmounting is
   * what guarantees the next driver never sees this one's cached screens.
   *
   * The frame's edge is M15-confirm → M2-default, so the reset lands on Login
   * directly rather than replaying the splash's session check.
   */
  const logOut = useCallback(async () => {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await authRepo.signOut();
    } finally {
      setSigningOut(false);
      setConfirming(false);
      navigation
        .getParent<NativeStackScreenProps<AppStackParamList>['navigation']>()
        ?.getParent<NativeStackScreenProps<RootStackParamList>['navigation']>()
        ?.reset({
          index: 0,
          routes: [{ name: 'Auth', params: { screen: 'Login' } }],
        });
    }
  }, [navigation, signingOut]);

  return (
    <View style={styles.screen}>
      <Topbar title="Profile" large />

      {error ? (
        <View style={styles.errorWrap}>
          <Toast tone="err" message={error} />
          <Button
            label="Try again"
            variant="secondary"
            onPress={reload}
            block
            style={styles.retry}
          />
        </View>
      ) : !data ? (
        <View style={styles.flex} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrl}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.head}>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{data.driver.initials}</Text>
            </View>
            <View style={styles.headText}>
              <Text style={styles.name} numberOfLines={1}>
                {data.driver.name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {data.driver.role} · {data.driver.base}
              </Text>
              {data.driver.active ? (
                <View style={styles.active}>
                  <CheckCircle2
                    size={14}
                    color={colors.stDoneInk}
                    strokeWidth={2.2}
                  />
                  <Text style={styles.activeText}>Active</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.card}>
            <Row
              icon={User}
              title="Contact info"
              subtitle={data.driver.email}
              onPress={goContactInfo}
              chevron
            />
            <Row
              icon={Banknote}
              title="Earnings"
              subtitle={
                <Text>
                  This week{' '}
                  <Money
                    amount={data.summary.thisWeekTotal}
                    style={styles.rowMoney}
                  />{' '}
                  · accruing
                </Text>
              }
              subtitleLabel={`This week ${formatMoney(
                data.summary.thisWeekTotal,
              )}, accruing`}
              onPress={goEarnings}
              chevron
            />
            <Row
              icon={Lock}
              title="Change password"
              onPress={goChangePassword}
              chevron
            />
            <Row
              icon={History}
              title="Job history"
              subtitle={`${data.driver.jobsCompleted} jobs completed`}
              onPress={goJobHistory}
              chevron
            />
            <Row
              icon={Bell}
              title="Notification settings"
              onPress={goNotificationSettings}
              chevron
              last
            />
          </View>

          <Button
            label="Log out"
            variant="secondary"
            icon={LogOut}
            ink={colors.stOverdueInk}
            onPress={askLogOut}
            block
            style={styles.logout}
          />
        </ScrollView>
      )}

      <Sheet visible={confirming} onDismiss={cancelLogOut}>
        <View style={styles.well}>
          <LogOut size={24} color={colors.stOverdue} strokeWidth={2} />
        </View>
        <Text style={styles.sheetTitle}>Log out?</Text>
        <Text style={styles.sheetBody}>
          You'll need to sign in again to see your assigned jobs.
        </Text>
        <Button
          label="Log out"
          variant="danger"
          loading={signingOut}
          onPress={logOut}
          block
          style={styles.sheetPrimary}
        />
        <Button
          label="Cancel"
          variant="secondary"
          onPress={cancelLogOut}
          block
        />
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  // `.scrl { padding: 20px 18px 100px }` — the 100 cleared the frame's own
  // `.tbar`, which the navigator draws here.
  scrl: {
    paddingTop: 20,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 24,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 22,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...display(800, 26), color: colors.onNavy },
  headText: { flex: 1, minWidth: 0 },
  name: { ...display(800, 20), color: colors.text },
  sub: { ...text(500, 14), color: colors.text2 },
  active: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  activeText: { ...text(600, 12), color: colors.stDoneInk },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r2,
    overflow: 'hidden',
  },
  /** `.row-s` is 13px; `.money` inside it keeps its 700 weight and tabular figures. */
  rowMoney: { fontSize: 13 },
  logout: { marginTop: 18, borderColor: tint.dangerLine },
  well: {
    width: 52,
    height: 52,
    borderRadius: radii.r2,
    backgroundColor: tint.priHigh,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { ...display(800, 19), color: colors.text, textAlign: 'center' },
  sheetBody: {
    ...text(500, 14),
    color: colors.text2,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  sheetPrimary: { marginBottom: 10 },
  errorWrap: { paddingHorizontal: spacing.screenH, paddingTop: 14 },
  retry: { marginTop: 12 },
});
