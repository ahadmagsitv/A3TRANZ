import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Download } from 'lucide-react-native';
import {
  Button,
  LegTotal,
  Money,
  SectionLabel,
  StatusPill,
  Toast,
  Topbar,
} from '../../../components';
import { payrollRepo } from '../../../data/repos';
import type { PayPeriod } from '../../../data/contracts';
import { useAsync } from '../../../hooks/useAsync';
import { chrome, colors, iconSize, radii } from '../../../theme/tokens';
import { shadowSm } from '../../../theme/shadows';
import { tabular, text } from '../../../theme/typography';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'StatementDetail'>;

type KLabel = 'id' | 'sub' | 'key';

const KROW_LABEL: Record<KLabel, object> = {
  id: { ...text(600, 13), ...tabular, color: colors.text },
  sub: { ...text(500, 13), color: colors.text2 },
  key: { ...text(500, 14), color: colors.text2 },
};

const KRow = ({
  label,
  labelKind = 'key',
  middle,
  value,
  amount,
  last = false,
}: {
  label: string;
  labelKind?: KLabel;
  middle?: string;
  value?: string;
  amount?: number;
  last?: boolean;
}): React.JSX.Element => (
  <View style={[styles.krow, last ? styles.krowLast : null]}>
    <Text style={KROW_LABEL[labelKind]}>{label}</Text>
    {middle ? <Text style={styles.krowMiddle}>{middle}</Text> : null}
    {amount === undefined ? (
      <Text style={styles.kv}>{value}</Text>
    ) : (
      <Money amount={amount} style={styles.kv} />
    )}
  </View>
);

export const StatementDetailScreen = ({
  navigation,
  route,
}: Props): React.JSX.Element => {
  const { periodId } = route.params;
  const insets = useSafeAreaInsets();

  const { data: period, loading, error, reload } = useAsync<PayPeriod | null>(
    () => payrollRepo.period(periodId),
    [periodId],
  );

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const paid = period?.status === 'paid';
  const methodShort = period?.method?.split(' — ')[0] ?? null;

  return (
    <View style={styles.screen}>
      <Topbar
        title="Statement"
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

        {!error && !loading && !period ? (
          <Toast tone="warn" message="That statement is no longer available." />
        ) : null}

        {period ? (
          <>
            <View style={styles.earn}>
              <View style={styles.earnTop}>
                <Text style={styles.earnLabel}>{period.label}</Text>
                <StatusPill
                  tone={paid ? 'done' : 'review'}
                  label={paid ? 'Paid' : 'Held'}
                  style={styles.pushRight}
                />
              </View>
              <Money
                amount={period.total}
                size="lg"
                style={styles.earnMoney}
              />
              <Text style={styles.sub}>
                {paid
                  ? `Paid ${period.paidOnLabel} · ${methodShort} · ref ${period.reference}`
                  : period.paysOnLabel}
              </Text>
            </View>

            <SectionLabel
              label={`Job legs · ${period.legCount}`}
              style={styles.sectLabel}
            />

            <View style={styles.legCard}>
              {period.lines.length > 0 ? (
                <>
                  {period.lines.map((line, i) => (
                    <KRow
                      key={`${line.jobId}-${line.leg}-${i}`}
                      label={`#${line.jobId}`}
                      labelKind="id"
                      middle={line.leg}
                      amount={line.amount}
                    />
                  ))}
                  {period.remainingLegCount > 0 ? (
                    <KRow
                      label={`+ ${period.remainingLegCount} more legs`}
                      labelKind="sub"
                      amount={period.remainingTotal}
                      last
                    />
                  ) : null}
                </>
              ) : (
                <KRow
                  label={`${period.legCount} job legs`}
                  labelKind="sub"
                  amount={period.total}
                  last
                />
              )}
              <LegTotal label="Period total" amount={period.total} />
            </View>

            {paid ? (
              <View style={styles.dcard}>
                <Text style={styles.dcardH}>Payment</Text>
                <KRow label="Method" value={period.method ?? '—'} />
                <KRow label="Reference" value={period.reference ?? '—'} />
                <KRow label="Paid on" value={period.paidOnLabel ?? '—'} last />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.btnbar,
          { paddingBottom: chrome.btnBarPadding.bottom + insets.bottom },
        ]}
      >
        <View importantForAccessibility="no-hide-descendants">
          <Button
            label="Download statement"
            variant="secondary"
            icon={Download}
            block
          />
        </View>
      </View>
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
  scrl: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 96 },
  retry: { marginTop: 12 },

  earn: {
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    padding: 16,
    marginBottom: 12,
    ...shadowSm,
  },
  earnTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  earnLabel: { ...text(600, 13), ...tabular, color: colors.text2 },
  pushRight: { marginLeft: 'auto' },
  earnMoney: { marginTop: 8 },
  sub: { ...text(500, 14), color: colors.text2, marginTop: 2 },
  sectLabel: { marginTop: 0, marginHorizontal: 0 },

  legCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    paddingTop: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginBottom: 12,
    ...shadowSm,
  },
  dcard: {
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...shadowSm,
  },
  dcardH: {
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
  krowMiddle: { ...text(500, 13), color: colors.text2 },
  kv: {
    ...text(600, 14),
    ...tabular,
    color: colors.text,
    marginLeft: 'auto',
    textAlign: 'right',
  },

  btnbar: {
    paddingTop: chrome.btnBarPadding.top,
    paddingHorizontal: chrome.btnBarPadding.horizontal,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
