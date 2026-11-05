import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banknote, Clock, MailCheck } from 'lucide-react-native';
import {
  Button,
  Empty,
  Money,
  StatusPill,
  Toast,
  Topbar,
} from '../../../components';
import { jobsRepo } from '../../../data/repos';
import type { Job } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { chrome, colors, iconSize, radii } from '../../../theme/tokens';
import { shadowSm } from '../../../theme/shadows';
import { text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Submitted'>;

export const SubmittedScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { jobId } = route.params;
  const insets = useSafeAreaInsets();

  const { data: job, error } = useAsync<Job | null>(
    () => jobsRepo.get(jobId),
    [jobId],
  );

  const youEarn = useMemo(
    () =>
      job?.legs
        .filter(l => l.driverLabel === 'You')
        .reduce((sum, l) => sum + l.amount, 0) ?? 0,
    [job],
  );

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const backToJobs = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Jobs' }),
    [navigation],
  );

  return (
    <View style={styles.screen}>
      <Topbar title="Confirm delivery" onBack={goBack} />

      {error ? (
        <View style={styles.errWrap}>
          <Toast tone="err" message={error} />
        </View>
      ) : null}

      <Empty
        icon={Clock}
        circleColor={colors.amberTint}
        iconColor={colors.stReview}
        title="Sent for approval"
        body={`Your closeout for #${jobId} is with the office. You’ll get a notification when it’s approved.`}
        actionMarginTop={6}
        action={
          <>
            <StatusPill tone="review" label="Awaiting approval" />

            <View style={styles.dcard}>
              <Text style={styles.dcardHead}>What happens next</Text>

              <View style={styles.krow}>
                <MailCheck
                  size={iconSize.err}
                  color={colors.text2}
                  strokeWidth={2}
                />
                <Text style={styles.krowLabel}>Customer emailed</Text>
                <Text style={styles.kv}>Sent just now</Text>
              </View>

              <View style={[styles.krow, styles.krowLast]}>
                <Banknote
                  size={iconSize.err}
                  color={colors.text2}
                  strokeWidth={2}
                />
                <Text style={styles.krowLabel}>Your legs go to payroll</Text>
                <Money amount={youEarn} style={styles.kv} />
              </View>
            </View>
          </>
        }
      />

      <View style={[styles.btnbar, { paddingBottom: 20 + insets.bottom }]}>
        <Button label="Back to jobs" onPress={backToJobs} block />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  errWrap: { paddingHorizontal: 18, paddingTop: 12 },
  dcard: {
    alignSelf: 'stretch',
    marginTop: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...shadowSm,
  },
  dcardHead: {
    ...text(700, 13, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  krow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  krowLast: { borderBottomWidth: 0 },
  krowLabel: { ...text(500, 14), color: colors.text2, flexShrink: 1 },
  kv: { ...text(600, 14), color: colors.text, marginLeft: 'auto' },
  btnbar: {
    paddingTop: chrome.btnBarPadding.top,
    paddingHorizontal: chrome.btnBarPadding.horizontal,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
