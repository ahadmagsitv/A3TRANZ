import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Camera,
  ClipboardCheck,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Button,
  FileChip,
  JobTypeChip,
  LegRow,
  LegTotal,
  MapEmbed,
  PriorityTag,
  StatusPill,
  Stepper,
  Toast,
  Topbar,
  UnitChip,
  toneForStatus,
} from '../../../components';
import { chatRepo, jobsRepo } from '../../../data/repos';
import type { Job, JobStep } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { chrome, colors, iconSize, radii } from '../../../theme/tokens';
import { shadowSm } from '../../../theme/shadows';
import { display, tabular, text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'JobDetail'>;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  progress: 'In Progress',
  review: 'Awaiting approval',
  done: 'Done',
  overdue: 'Overdue',
};

/**
 * The `.btnbar` CTA is whichever step the driver is actually on. The frame only
 * draws the Pending case; the other three are the same button pointing at the
 * next capture screen, because M7 is the hub every step is entered from.
 *
 * It is never locked here — the gate lives on the step screen, and a step is
 * always allowed to be OPENED. Locking is for submitting without evidence.
 */
const CTA: Record<
  JobStep,
  { label: string; icon: LucideIcon; route: keyof AppStackParamList }
> = {
  pretrip: {
    label: 'Start pre-trip inspection',
    icon: ClipboardCheck,
    route: 'PreTripInspection',
  },
  pickup: { label: 'Confirm pickup', icon: Camera, route: 'ConfirmPickup' },
  load: { label: 'Confirm load', icon: Camera, route: 'ConfirmLoad' },
  delivery: {
    label: 'Confirm delivery',
    icon: Camera,
    route: 'ConfirmDelivery',
  },
};

/**
 * `M7-default` — the job-detail hub.
 *
 * Outbound: M4 (back), M12 (chat), M8 (attachments), M19–M22 (the step CTA).
 * Chrome: fixed `.topbar` and fixed `.btnbar`, one scrolling child between them
 * (§6.4). The `.btnbar` sits above the keyboard and the Android nav bar because
 * it is a flex sibling of the scroll view, not an overlay.
 */
export const JobDetailScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { jobId } = route.params;
  const insets = useSafeAreaInsets();

  const { data: job, loading, error, reload } = useAsync<Job | null>(
    () => jobsRepo.get(jobId),
    [jobId],
  );

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const openChat = useCallback(() => {
    // Threads are job-scoped (§6.8), so the job is the key and the thread id
    // is looked up rather than guessed. A job with no thread yet simply has
    // nothing to open — M-08 owns creating one.
    chatRepo
      .threads()
      .then(threads => {
        const thread = threads.find(t => t.jobId === jobId);
        if (thread) {
          navigation.navigate('JobChat', { threadId: thread.id });
        }
      })
      .catch(() => undefined);
  }, [navigation, jobId]);

  const openAttachments = useCallback(
    () => navigation.navigate('Attachments', { jobId }),
    [navigation, jobId],
  );

  const cta = job ? CTA[job.step] : null;
  const startStep = useCallback(() => {
    if (cta) {
      navigation.navigate(cta.route as 'PreTripInspection', { jobId });
    }
  }, [navigation, cta, jobId]);

  /** M7 lists what the office sent with the job; M8 lists everything. */
  const officeDocs = useMemo(
    () => job?.attachments.filter(a => a.origin === 'admin') ?? [],
    [job],
  );

  const youEarn = useMemo(
    () =>
      job?.legs
        .filter(l => l.driverLabel === 'You')
        .reduce((sum, l) => sum + l.amount, 0) ?? 0,
    [job],
  );

  const tone = job ? toneForStatus(job.status, job.overdue) : 'pending';
  // A closed-out job has no next action — the office owns it now.
  const showCta =
    job !== null &&
    cta !== null &&
    job.status !== 'awaiting_approval' &&
    job.status !== 'done';

  return (
    <View style={styles.screen}>
      <Topbar
        title="Job details"
        onBack={goBack}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Message the office about this job"
            onPress={openChat}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconbtn,
              pressed ? styles.pressed : null,
            ]}
          >
            <MessageSquare
              size={iconSize.iconBtn}
              color={colors.text}
              strokeWidth={2.2}
            />
          </Pressable>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrl}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <>
            <Toast tone="err" message={error} />
            <Button
              label="Try again"
              variant="secondary"
              onPress={reload}
              block
              style={styles.retry}
            />
          </>
        ) : null}

        {!job && !loading && !error ? (
          <Toast tone="warn" message="That job is no longer assigned to you." />
        ) : null}

        {job ? (
          <>
            <View style={styles.chips}>
              <StatusPill tone={tone} label={STATUS_LABEL[tone] ?? 'Pending'} />
              <JobTypeChip type={job.type} />
              <PriorityTag priority={job.priority} />
            </View>

            <Text style={styles.title}>{job.title}</Text>
            <Text style={styles.customer}>{job.customerName}</Text>
            <Text style={styles.refs}>
              {job.containerNo
                ? `#${job.id} · ${job.containerNo}`
                : `#${job.id}`}
            </Text>

            {job.truckId || job.chassisId ? (
              <View style={styles.units}>
                {job.truckId ? (
                  <UnitChip id={job.truckId} kind="truck" />
                ) : null}
                {job.chassisId ? (
                  <UnitChip id={job.chassisId} kind="chassis" />
                ) : null}
              </View>
            ) : null}

            <Stepper
              current={job.step}
              allDone={job.status === 'awaiting_approval' || job.status === 'done'}
              style={styles.stepper}
            />

            {job.legs.length > 0 ? (
              <View style={styles.dcard}>
                <Text style={styles.dcardHead}>Your legs</Text>
                {job.legs.map((leg, i) => (
                  <LegRow
                    key={leg.kind}
                    leg={leg}
                    last={i === job.legs.length - 1}
                  />
                ))}
                <LegTotal label="You earn" amount={youEarn} />
              </View>
            ) : null}

            <MapEmbed query={job.mapQuery} address={job.address} />

            <View style={styles.dates}>
              <View style={styles.dateCard}>
                <Text style={styles.dateLabel}>Assigned</Text>
                <Text style={styles.dateValue}>
                  {job.assignedLabel ?? '—'}
                </Text>
              </View>
              <View style={styles.dateCard}>
                <Text style={styles.dateLabel}>Due</Text>
                <Text
                  style={[
                    styles.dateValue,
                    job.overdue || job.dueToday ? styles.dateUrgent : null,
                  ]}
                >
                  {job.dueLabel ?? '—'}
                </Text>
              </View>
            </View>

            {job.description ? (
              <>
                <Text style={styles.sectLabel}>Description</Text>
                <Text style={styles.instr}>{job.description}</Text>
              </>
            ) : null}

            {job.instructions ? (
              <>
                <Text style={styles.sectLabel}>Instructions</Text>
                <Text style={styles.instr}>{job.instructions}</Text>
              </>
            ) : null}

            {officeDocs.length > 0 ? (
              <>
                <Text style={styles.sectLabel}>Attachments</Text>
                {officeDocs.map(a => (
                  <FileChip
                    key={a.id}
                    attachment={a}
                    onPress={openAttachments}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {showCta && cta ? (
        <View style={[styles.btnbar, { paddingBottom: 20 + insets.bottom }]}>
          <Button
            label={cta.label}
            icon={cta.icon}
            onPress={startStep}
            block
            lockCopy={
              job.step === 'pretrip' && job.truckId
                ? `${job.truckId} must pass its DOT check before you can start`
                : null
            }
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  iconbtn: {
    width: chrome.iconButton,
    height: chrome.iconButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pressed: { opacity: 0.7 },
  // `.scrl { padding: 16px 18px 96px }` — the 96 cleared the frame's absolute
  // `.btnbar`; here that bar is a flex sibling, so only breathing room is left.
  scrl: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 20 },
  retry: { marginTop: 12 },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  title: { ...display(800, 22, -0.4), color: colors.text },
  customer: { ...text(500, 14), color: colors.text2, marginBottom: 4 },
  refs: { ...text(500, 14), ...tabular, color: colors.text2, marginBottom: 14 },
  units: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stepper: { marginBottom: 16 },
  dcard: {
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...shadowSm,
  },
  dcardHead: {
    ...text(700, 13, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  dates: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dateCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r,
    padding: 12,
  },
  dateLabel: { ...text(500, 12), color: colors.text2 },
  dateValue: {
    ...text(700, 14),
    ...tabular,
    color: colors.text,
    marginTop: 3,
  },
  dateUrgent: { color: colors.stOverdueInk },
  // `.sect-lbl` with the frame's `margin-left: 0` override.
  sectLabel: {
    ...text(700, 12, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  instr: { ...text(500, 14), color: colors.text2, lineHeight: 22 },
  btnbar: {
    paddingTop: chrome.btnBarPadding.top,
    paddingHorizontal: chrome.btnBarPadding.horizontal,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
