import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Clock, Download } from 'lucide-react-native';
import {
  Button,
  Empty,
  LegTotal,
  Money,
  SectionLabel,
  Segmented,
  StatusPill,
  Toast,
  Topbar,
  type PillTone,
  type SegmentedOption,
} from '../../../components';
import { driversRepo, payrollRepo } from '../../../data/repos';
import type {
  EarningsSummary,
  PayPeriod,
  PayPeriodStatus,
} from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { chrome, colors, iconSize, radii } from '../../../theme/tokens';
import { shadowSm } from '../../../theme/shadows';
import { display, tabular, text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Earnings'>;

type Tab = 'pending' | 'paid';

const PERIOD_PILL: Record<PayPeriodStatus, { tone: PillTone; label: string }> = {
  accruing: { tone: 'pending', label: 'Accruing' },
  held: { tone: 'review', label: 'Held' },
  paid: { tone: 'done', label: 'Paid' },
};

const PeriodRow = memo(function PeriodRow({
  period,
  onPress,
}: {
  period: PayPeriod;
  onPress?: () => void;
}) {
  const pill = PERIOD_PILL[period.status];
  const body = (
    <>
      <View style={styles.perBody}>
        <Text style={styles.pd}>{period.label}</Text>
        <Text style={styles.ps}>{period.subLabel}</Text>
      </View>
      <View style={styles.pa}>
        <Money amount={period.total} style={styles.perAmount} />
        <StatusPill
          tone={pill.tone}
          label={pill.label}
          style={styles.perPill}
        />
      </View>
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${period.label}. ${period.subLabel}. Open statement.`}
      onPress={onPress}
      style={({ pressed }) => [styles.perrow, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.perrow}>{body}</View>
  );
});

interface EarningsData {
  summary: EarningsSummary;
  pending: PayPeriod[];
  paid: PayPeriod[];
}

export const EarningsScreen = ({ navigation }: Props): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('pending');

  const { data, loading, error, reload } = useAsync<EarningsData>(async () => {
    const me = await driversRepo.me();
    const [summary, pending, paid] = await Promise.all([
      payrollRepo.summary(me.id),
      payrollRepo.periods(me.id, 'pending'),
      payrollRepo.periods(me.id, 'paid'),
    ]);
    return { summary, pending, paid };
  }, []);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const onChangeTab = useCallback((key: string) => setTab(key as Tab), []);

  const openStatement = useCallback(
    (periodId: string) => navigation.navigate('StatementDetail', { periodId }),
    [navigation],
  );

  const options = useMemo<SegmentedOption[]>(
    () => [
      { key: 'pending', label: 'Pending', count: data?.summary.pendingPeriodCount },
      { key: 'paid', label: 'Paid', count: data?.summary.paidPeriodCount },
    ],
    [data],
  );

  const periods = (tab === 'pending' ? data?.pending : data?.paid) ?? [];

  const renderItem = useCallback(
    ({ item }: { item: PayPeriod }) => (
      <PeriodRow
        period={item}
        onPress={
          item.status === 'accruing'
            ? undefined
            : () => openStatement(item.id)
        }
      />
    ),
    [openStatement],
  );

  const summary = data?.summary;

  const header = summary ? (
    <>
      <View style={styles.earn}>
        <View style={styles.earnTop}>
          <Text style={styles.earnLabel}>
            {tab === 'pending' ? 'Awaiting payment' : 'Paid this year'}
          </Text>
          <StatusPill
            tone={tab === 'pending' ? 'pending' : 'done'}
            label={`${
              tab === 'pending'
                ? summary.pendingPeriodCount
                : summary.paidPeriodCount
            } periods`}
            style={styles.pushRight}
          />
        </View>
        <Money
          amount={
            tab === 'pending' ? summary.pendingTotal : summary.paidTotal
          }
          size="lg"
          style={styles.earnMoney}
        />
        <Text style={styles.sub}>
          {tab === 'pending'
            ? `${summary.pendingLegCount} job legs · next payment ${summary.nextPaymentLabel}`
            : `Last payment ${summary.lastPaymentLabel} · ref ${summary.lastPaymentReference}`}
        </Text>
      </View>

      <Toast
        tone="info"
        icon={Clock}
        message={summary.holdRule}
        style={styles.holdRule}
      />

      <SectionLabel
        label={tab === 'pending' ? 'Open periods' : 'Paid periods'}
        style={styles.sectLabel}
      />
    </>
  ) : null;

  const footer = summary ? (
    tab === 'pending' ? (
      periods.length > 0 ? (
        <LegTotal
          label="Total pending"
          amount={summary.pendingTotal}
          style={styles.legtotal}
        />
      ) : null
    ) : (
      <Text style={styles.viewAll}>
        Showing {periods.length} of {summary.paidPeriodCount} periods
      </Text>
    )
  ) : null;

  return (
    <View style={styles.screen}>
      <Topbar
        title="Earnings"
        onBack={goBack}
        right={
          <View
            style={styles.iconbtn}
            importantForAccessibility="no-hide-descendants"
          >
            <Download
              size={iconSize.iconBtn}
              color={colors.muted}
              strokeWidth={2.2}
            />
          </View>
        }
      />

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
      ) : loading && !data ? (
        <View style={styles.flex} />
      ) : (
        <FlatList
          data={periods}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={header ?? undefined}
          ListFooterComponent={footer ?? undefined}
          ListEmptyComponent={
            <Empty
              icon={Clock}
              title={
                tab === 'pending' ? 'Nothing pending' : 'No payments yet'
              }
              body={
                tab === 'pending'
                  ? 'Legs you run this week appear here as they close.'
                  : 'Statements appear here once a period has been paid.'
              }
            />
          }
          contentContainerStyle={[
            styles.scrl,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const keyExtractor = (period: PayPeriod): string => period.id;

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
  scrl: { paddingTop: 16, paddingHorizontal: 18, flexGrow: 1 },
  errorWrap: { paddingHorizontal: 18, paddingTop: 14 },
  retry: { marginTop: 12 },

  earn: {
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    padding: 16,
    marginBottom: 12,
    ...shadowSm,
  },
  earnTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  earnLabel: { ...text(600, 13), color: colors.text2 },
  pushRight: { marginLeft: 'auto' },
  earnMoney: { marginTop: 8 },
  sub: { ...text(500, 14), color: colors.text2, marginTop: 2 },
  holdRule: { marginBottom: 16 },
  sectLabel: { marginTop: 0, marginHorizontal: 0 },

  perrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r2,
    marginBottom: 10,
  },
  pressed: { backgroundColor: colors.surface2 },
  perBody: { flex: 1, minWidth: 0 },
  pd: { ...text(600, 14), ...tabular, color: colors.text },
  ps: { ...text(500, 12), color: colors.text2, marginTop: 2 },
  pa: { marginLeft: 'auto', alignItems: 'flex-end' },
  perAmount: { ...display(800, 17, -0.4), ...tabular, color: colors.text },
  perPill: { marginTop: 4 },

  legtotal: { marginTop: 14 },
  viewAll: {
    ...text(600, 13),
    color: colors.amberInk,
    textAlign: 'center',
    marginTop: 14,
  },
});
