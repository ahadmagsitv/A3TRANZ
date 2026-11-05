import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Calendar, Camera, History } from 'lucide-react-native';
import {
  Button,
  Empty,
  JobCard,
  Toast,
  Topbar,
  type JobCardMeta,
} from '../../../components';
import { jobsRepo } from '../../../data/repos';
import type { Job } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { colors, spacing } from '../../../theme/tokens';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'JobHistory'>;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const dateLabel = (iso: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) {
    return null;
  }
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
};

const metaFor = (job: Job): JobCardMeta[] => {
  const meta: JobCardMeta[] = [];
  const when = dateLabel(job.approvedAt ?? job.dueAt);
  if (when) {
    meta.push({ icon: Calendar, label: when });
  }
  if (job.photoCount > 0) {
    meta.push({ icon: Camera, label: String(job.photoCount) });
  }
  return meta;
};

export const JobHistoryScreen = ({ navigation }: Props): React.JSX.Element => {
  const { data, loading, error, reload } = useAsync<Job[]>(
    () => jobsRepo.list({ status: 'done' }),
    [],
  );

  const jobs = useMemo(() => data ?? [], [data]);

  const openJob = useCallback(
    (jobId: string) => navigation.navigate('JobDetail', { jobId }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Job }) => (
      <JobCard
        job={item}
        onPress={() => openJob(item.id)}
        showPriority={false}
        showLocation={false}
        meta={metaFor(item)}
      />
    ),
    [openJob],
  );

  const back = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={styles.screen}>
      <Topbar title="Job history" onBack={back} />

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
      ) : jobs.length === 0 ? (
        loading ? (
          <View style={styles.flex} />
        ) : (
          <Empty
            icon={History}
            title="No completed jobs yet"
            body="Jobs you finish and that get approved will appear here."
          />
        )
      ) : (
        <FlatList
          data={jobs}
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
const Gap = (): React.JSX.Element => <View style={styles.gap} />;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrl: {
    paddingTop: 14,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 24,
  },
  gap: { height: 10 },
  errorWrap: { paddingHorizontal: spacing.screenH, paddingTop: 14 },
  retry: { marginTop: 12 },
});
