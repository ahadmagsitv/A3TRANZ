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

/**
 * `.krow` — label · optional middle · `.kv` value.
 *
 * The frame overrides the label per context: a job id is `600 13px --text`
 * (`.bignum`), a roll-up line is `500 13px --text-2`, and a payment key keeps
 * the base rule's `500 14px --text-2`.
 */
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

/**
 * `M25-statement-detail` — one pay period, leg by leg.
 *
 * READ-ONLY. A driver never edits a price (§6.9); amounts are editable on the
 * web payroll screen only, so nothing on this screen takes a change handler.
 *
 * Reached from either M24 tab, so it renders a held period as well as a paid
 * one: a held period has no payment record yet and its lines may not be broken
 * out, and both cases degrade to the period total rather than to a blank card.
 */
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
  // `.sub` reads 'Paid Fri, Nov 21 · ACH · ref PR-1142' — the short method
  // name, which is the head of 'ACH — direct deposit'.
  const methodShort = period?.method?.split(' — ')[0] ?? null;

  return (
    <View style={styles.screen}>
      <Topbar
        title="Statement"
        onBack={goBack}
        right={
          /* Same call as M24: no statement file exists in the mock and no
             download frame is designed, so this renders as the `.iconbtn` it
             is rather than as a dead button.
             ponytail: make it a Pressable the day the API serves a PDF. */
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
            {/* `.earn` — the period headline. */}
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
                /* Older periods are stored as a total without their line
                   detail. Showing the count and the total beats an empty card
                   or a fabricated breakdown. */
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

      {/* `.btnbar` — fixed bottom, own top hairline. */}
      <View
        style={[
          styles.btnbar,
          { paddingBottom: chrome.btnBarPadding.bottom + insets.bottom },
        ]}
      >
        {/*
          The frame's only action. Nothing in the mock produces a statement
          file and no download flow is designed, so it renders as the button
          the frame draws but takes no press — a tap that appears to do
          nothing is worse than a control that plainly is not live yet.
          ponytail: pass `onPress` the day the API serves a statement PDF;
          everything else on this screen is already read-only by design.
        */}
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
  // `.scrl { padding: 16px 18px 96px }` — the 96 clears the `.btnbar`.
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

  // `.dcard` with the frame's `padding:6px 16px 12px` override on the legs card.
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
  // `.dcard-h { font:700 13px --f; uppercase; letter-spacing:.5px }`
  dcardH: {
    ...text(700, 13, 0.5),
    color: colors.text2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  // `.krow { padding:9px 0; gap:10; border-bottom:1px --hairline }`
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
  // `.krow .kv { font:600 14px --f; --text; tabular; margin-left:auto }`
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
