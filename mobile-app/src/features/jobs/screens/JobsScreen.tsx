import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Calendar,
  Camera,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Paperclip,
  Search,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Button,
  Empty,
  JobCard,
  Segmented,
  Toast,
  Topbar,
  type JobCardMeta,
  type SegmentedOption,
} from '../../../components';
import { jobsRepo } from '../../../data/repos';
import type { Job, JobStatus } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { chrome, colors, iconSize, radii } from '../../../theme/tokens';
import type {
  AppStackParamList,
  TabParamList,
} from '../../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Jobs'>,
  NativeStackScreenProps<AppStackParamList>
>;

type Tab = 'pending' | 'progress' | 'completed';

const TAB_STATUS: Record<Tab, JobStatus[]> = {
  pending: ['pending', 'blocked'],
  progress: ['in_progress'],
  completed: ['awaiting_approval', 'done'],
};

/**
 * §8 Q7 — only Pending has a designed empty frame. In Progress and Completed
 * reuse the same `.empty` with their own copy rather than inventing a second
 * visual. Pending's three strings are verbatim from `M4-empty`.
 */
const EMPTY: Record<Tab, { icon: LucideIcon; title: string; body: string }> = {
  pending: {
    icon: ClipboardCheck,
    title: "You're all caught up",
    body: 'No pending jobs right now. New assignments will appear here.',
  },
  progress: {
    icon: Truck,
    title: 'Nothing on the road',
    body: 'Start a pending job and it will move here while you run it.',
  },
  completed: {
    icon: CheckCheck,
    title: 'No closed jobs yet',
    body: 'Jobs you submit appear here while the office reviews them.',
  },
};

/**
 * Each list carries a different trailing meta item — read them off the frames
 * rather than showing one row everywhere: M4 wants the due date and the paper
 * clip, M5 wants the photo count, M6 wants how the job ended.
 */
const metaFor = (tab: Tab, job: Job): JobCardMeta[] => {
  const meta: JobCardMeta[] = [];
  if (job.dueLabel) {
    const icon: LucideIcon =
      tab !== 'completed'
        ? Calendar
        : job.status === 'awaiting_approval'
        ? Clock
        : CheckCircle2;
    meta.push({ icon, label: job.dueLabel });
  }
  if (tab === 'pending') {
    // The clip counts what the office sent with the job — the same set M7
    // lists under Attachments. Photos the driver took are the camera count.
    const docs = job.attachments.filter(a => a.origin === 'admin').length;
    if (docs > 0) {
      meta.push({ icon: Paperclip, label: String(docs) });
    }
  } else if (tab === 'progress' && job.photoCount > 0) {
    meta.push({ icon: Camera, label: String(job.photoCount) });
  }
  return meta;
};

/**
 * `M4-default` · `M4-empty` · `M5-default` · `M6-default`.
 *
 * ONE screen. The `.seg` switches which list renders; the topbar, segmented
 * control and `.tbar` are fixed chrome and the `FlatList` is the single
 * scrolling child (§6.4).
 */
export const JobsScreen = ({ navigation }: Props): React.JSX.Element => {
  const [tab, setTab] = useState<Tab>('pending');

  const { data, loading, error, reload } = useAsync<Job[]>(
    () => jobsRepo.list(),
    [],
  );

  const jobs = useMemo(() => data ?? [], [data]);
  const buckets = useMemo(
    () =>
      ({
        pending: jobs.filter(j => TAB_STATUS.pending.includes(j.status)),
        progress: jobs.filter(j => TAB_STATUS.progress.includes(j.status)),
        completed: jobs.filter(j => TAB_STATUS.completed.includes(j.status)),
      } satisfies Record<Tab, Job[]>),
    [jobs],
  );

  const options = useMemo<SegmentedOption[]>(
    () => [
      { key: 'pending', label: 'Pending', count: buckets.pending.length },
      { key: 'progress', label: 'In Progress', count: buckets.progress.length },
      // The frame gives Completed no count — it is not a queue to work down.
      { key: 'completed', label: 'Completed' },
    ],
    [buckets],
  );

  const onChangeTab = useCallback((key: string) => setTab(key as Tab), []);

  const openJob = useCallback(
    (jobId: string) => navigation.navigate('JobDetail', { jobId }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Job }) => (
      <JobCard
        job={item}
        onPress={() => openJob(item.id)}
        showPriority={tab !== 'completed'}
        meta={metaFor(tab, item)}
      />
    ),
    [openJob, tab],
  );

  const list = buckets[tab];
  const empty = EMPTY[tab];

  return (
    <View style={styles.screen}>
      <Topbar
        title="My Jobs"
        large
        right={
          /* The frame draws a search affordance but the flow graph gives it no
             target and no results screen is designed, so it renders as the
             `.iconbtn` it is and stays inert rather than shipping a control
             that does nothing when pressed.
             ponytail: wire it the day a search frame exists. */
          <View style={styles.iconbtn} importantForAccessibility="no-hide-descendants">
            <Search
              size={iconSize.iconBtn}
              color={colors.muted}
              strokeWidth={2.2}
            />
          </View>
        }
      />

      {/* `.seg { margin: 14px 18px 0 }` */}
      <View style={styles.segWrap}>
        <Segmented options={options} value={tab} onChange={onChangeTab} />
      </View>

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
      ) : list.length === 0 ? (
        // Never show the empty state while the first read is still in flight —
        // "you're all caught up" is a lie for 300ms otherwise.
        loading ? (
          <View style={styles.flex} />
        ) : (
          <Empty icon={empty.icon} title={empty.title} body={empty.body} />
        )
      ) : (
        <FlatList
          data={list}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={styles.scrl}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const keyExtractor = (job: Job): string => job.id;
/** `.stack { gap: 10px }` */
const Gap = (): React.JSX.Element => <View style={styles.gap} />;

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
  segWrap: { marginTop: 14, marginHorizontal: 18 },
  // `.scrl { padding: 14px 18px 100px }` — the 100 cleared the frame's own
  // 84px `.tbar`, which is the navigator's view here.
  scrl: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 16 },
  gap: { height: 10 },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },
});
