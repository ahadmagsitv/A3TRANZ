import React, { useCallback } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Navigation,
  Truck,
} from 'lucide-react-native';
import {
  Button,
  Empty,
  Money,
  StatCard,
  StatusPill,
  Stepper,
  Toast,
  JobCard,
} from '../../../components';
import { driversRepo, jobsRepo, payrollRepo } from '../../../data/repos';
import type { DriverOverview, EarningsSummary, Job } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { colors, radii, tint } from '../../../theme/tokens';
import { shadowSm } from '../../../theme/shadows';
import { display, tabular, text } from '../../../theme/typography';
import type { AppStackParamList, TabParamList } from '../../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<AppStackParamList>
>;

interface HomeData {
  initials: string;
  overview: DriverOverview;
  summary: EarningsSummary;
  upNext: Job | null;
}

/**
 * `M18-dashboard` — the entry tab.
 *
 * Chrome: `.home-head` is fixed (it is a topbar in everything but name — its
 * 50px top padding absorbs the status bar) and `.scrl` is the single scrolling
 * child (§6.4). The `.tbar` is the navigator's, so the frame's 96px bottom
 * reservation drops to plain breathing room here.
 */
export const HomeScreen = ({ navigation }: Props): React.JSX.Element => {
  const insets = useSafeAreaInsets();

  const { data, loading, error, reload } = useAsync<HomeData>(async () => {
    const [me, overview] = await Promise.all([
      driversRepo.me(),
      driversRepo.overview(),
    ]);
    const [summary, upNext] = await Promise.all([
      payrollRepo.summary(me.id),
      // Null when the driver has nothing queued — a finished day is a state,
      // not a failure. Fetching it blindly turned `GET /jobs/null` into a 404
      // that took the whole Home screen down with it.
      overview.upNextJobId ? jobsRepo.get(overview.upNextJobId) : null,
    ]);
    return { initials: me.initials, overview, summary, upNext };
  }, []);

  const openEarnings = useCallback(
    () => navigation.navigate('Earnings'),
    [navigation],
  );
  const openAlerts = useCallback(
    () => navigation.navigate('Alerts'),
    [navigation],
  );
  const openUpNext = useCallback(() => {
    if (data?.upNext) {
      navigation.navigate('JobDetail', { jobId: data.upNext.id });
    }
  }, [navigation, data]);

  /**
   * The design draws a Navigate button but the flow graph gives it no target —
   * a driver tapping it wants the turn-by-turn app, not another A3TRANZ screen,
   * so it hands the address to whatever maps app the phone has.
   */
  const navigateToJob = useCallback(() => {
    const address = data?.upNext?.address;
    if (!address) {
      return;
    }
    const q = encodeURIComponent(address);
    Linking.openURL(
      Platform.OS === 'ios' ? `maps://?q=${q}` : `geo:0,0?q=${q}`,
    ).catch(() => Linking.openURL(`https://maps.google.com/maps?q=${q}`));
  }, [data]);

  const overview = data?.overview;

  return (
    <View style={styles.screen}>
      {/* `.home-head` — fixed chrome, 50px 18px 14px. */}
      <View style={[styles.head, { paddingTop: insets.top }]}>
        <View style={styles.headLeft}>
          <Text style={styles.date}>{overview?.dateLabel ?? ' '}</Text>
          <Text style={styles.greet} numberOfLines={1}>
            {overview?.greeting ?? ' '}
          </Text>
        </View>
        <View style={styles.headRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              overview
                ? `Notifications, ${overview.unreadNotifications} unread`
                : 'Notifications'
            }
            hitSlop={12}
            onPress={openAlerts}
            style={styles.bell}
          >
            <Bell size={23} color={colors.text2} strokeWidth={2} />
            {overview && overview.unreadNotifications > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {overview.unreadNotifications}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{data?.initials ?? ''}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrl}
        showsVerticalScrollIndicator={false}
      >
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
        ) : null}

        {data ? (
          <>
            {/* `.earn` — the this-week card. Opens M24. */}
            <View style={styles.earnWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="This week's earnings. Open earnings."
                onPress={openEarnings}
                style={({ pressed }) => [
                  styles.earn,
                  pressed ? styles.pressedCard : null,
                ]}
              >
                <View style={styles.earnTop}>
                  <Text style={styles.earnLabel}>
                    {data.summary.thisWeekLabel}
                  </Text>
                  <StatusPill
                    tone="pending"
                    label="Accruing"
                    style={styles.pushRight}
                  />
                </View>
                <View style={styles.earnMid}>
                  <Money amount={data.summary.thisWeekTotal} size="lg" />
                  <Text style={styles.earnLegs}>
                    {data.summary.thisWeekLegCount} legs
                  </Text>
                  <ChevronRight
                    size={18}
                    color={colors.text2}
                    strokeWidth={2}
                    style={styles.earnChevron}
                  />
                </View>
                <Text style={styles.earnHold}>
                  Held one week · pays {data.summary.thisWeekPaysOnLabel}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectLabel}>Up next</Text>
            <View style={styles.upNextWrap}>
              {data.upNext ? (
                <JobCard
                  job={data.upNext}
                  onPress={openUpNext}
                  chevron={false}
                  showPriority={false}
                  showTruck
                  trailing={data.upNext.dueLabel ?? undefined}
                >
                  <Stepper
                    current={data.upNext.step}
                    compact
                    style={styles.stepper}
                  />
                  <View style={styles.actions}>
                    <View style={styles.flex}>
                      <Button
                        label="Navigate"
                        icon={Navigation}
                        onPress={navigateToJob}
                        block
                      />
                    </View>
                    <View style={styles.flex}>
                      <Button
                        label="Open job"
                        variant="secondary"
                        onPress={openUpNext}
                        block
                      />
                    </View>
                  </View>
                </JobCard>
              ) : (
                // A driver with nothing queued has finished, not broken. Same
                // `.empty` language every other list uses rather than a bare
                // heading over a blank box.
                <Empty
                  icon={CheckCircle2}
                  title="Nothing up next"
                  body="You have no jobs waiting. New assignments show up here."
                />
              )}
            </View>

            <Text style={styles.sectLabel}>Overview</Text>
            <View style={styles.stats}>
              <View style={styles.statRow}>
                <StatCard
                  icon={Clock}
                  label="Pending"
                  value={data.overview.pending}
                  iconColor={colors.stPending}
                  iconBackground={tint.statPending}
                />
                <StatCard
                  icon={Truck}
                  label="In Progress"
                  value={data.overview.inProgress}
                  iconColor={colors.stProgress}
                  iconBackground={tint.statProgress}
                />
              </View>
              <View style={styles.statRow}>
                <StatCard
                  icon={Check}
                  label="Done · wk"
                  value={data.overview.doneThisWeek}
                  iconColor={colors.stDone}
                  iconBackground={tint.statDone}
                />
                <StatCard
                  icon={AlertCircle}
                  label="Overdue"
                  value={data.overview.overdue}
                  iconColor={colors.stOverdue}
                  iconBackground={tint.statOverdue}
                  alert
                />
              </View>
            </View>
          </>
        ) : null}

        {/* The mock resolves in 200–400ms and the design has no mobile skeleton
            frame, so the chrome holds its place and the body simply fills in.
            ponytail: if a real API makes this a long wait, add a `.skel`
            shimmer here — the admin gallery already defines one to copy. */}
        {loading && !data ? <View style={styles.loadingSpace} /> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  headLeft: { flex: 1 },
  date: {
    ...display(700, 12, 1.5),
    color: colors.sel,
    textTransform: 'uppercase',
  },
  greet: { ...display(800, 22, -0.3), color: colors.text, marginTop: 4 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bell: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 17,
    height: 17,
    borderRadius: radii.pill,
    backgroundColor: colors.stOverdue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: { ...text(700, 10), ...tabular, color: colors.onNavy },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.sel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...display(800, 14), color: colors.onNavy },
  // The `.tbar` is the navigator's own view here, so the frame's 96px bottom
  // reservation is not needed — only the breathing room it left over.
  scrl: { paddingBottom: 12 },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
  earnWrap: { paddingHorizontal: 18, paddingTop: 14 },
  earn: {
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    padding: 16,
    ...shadowSm,
  },
  pressedCard: { opacity: 0.9 },
  earnTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  earnLabel: { ...text(600, 13), color: colors.text2 },
  pushRight: { marginLeft: 'auto' },
  earnMid: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  earnLegs: {
    ...text(500, 14),
    ...tabular,
    color: colors.text2,
    paddingBottom: 5,
  },
  earnChevron: { marginLeft: 'auto', marginBottom: 8 },
  earnHold: { ...text(500, 12), color: colors.text2, marginTop: 4 },
  // `.sect-lbl { margin: 18px 18px 8px }`
  sectLabel: {
    ...text(700, 12, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginHorizontal: 18,
    marginBottom: 8,
  },
  upNextWrap: { paddingHorizontal: 18 },
  stepper: { marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  // `.home-stats { padding: 8px 18px 18px; gap: 12 }`
  stats: { paddingTop: 8, paddingHorizontal: 18, paddingBottom: 18, gap: 12 },
  statRow: { flexDirection: 'row', gap: 12 },
  loadingSpace: { height: 320 },
});
