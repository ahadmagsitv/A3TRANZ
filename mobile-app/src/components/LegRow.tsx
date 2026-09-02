import React, { memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { User, Users } from 'lucide-react-native';
import { colors } from '../theme/tokens';
import { display, tabular, text } from '../theme/typography';
import { Money } from './Money';
import type { JobLeg } from '../data/contracts';

/**
 * `.legrow` — READ-ONLY on mobile (§6.9).
 *
 * One job can pay three different people. Amounts are editable on the web
 * payroll screen only; a driver never edits a price, so this component takes no
 * change handler at all.
 */
export const LegRow = memo(function LegRow({
  leg,
  last = false,
}: {
  leg: JobLeg;
  last?: boolean;
}) {
  /**
   * A leg paid to somebody else reads `users` and its amount drops to
   * `--text-2`: it is on the job card but it is not this driver's money. Still
   * never green, never amber (§6.7) — the ink only says "not yours".
   */
  const mine = leg.driverLabel === 'You';
  const Who = mine ? User : Users;
  return (
    <View style={[styles.row, last ? styles.rowLast : null]}>
      <Text style={styles.label}>{leg.label}</Text>
      <View style={styles.who}>
        <Who size={14} color={colors.muted} strokeWidth={2} />
        <Text style={styles.whoLabel}>{leg.driverLabel}</Text>
      </View>
      <Money
        amount={leg.amount}
        style={[styles.amount, mine ? null : styles.amountOther]}
      />
    </View>
  );
});

/** `.legtotal` — the rule above it is 2px, not a hairline. */
export const LegTotal = memo(function LegTotal({
  label,
  amount,
  style,
}: {
  label: string;
  amount: number;
  /** M24 and M25 override the 6px top margin inline. */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.total, style]}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Money amount={amount} style={styles.totalAmount} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { ...text(600, 14), color: colors.text, width: 78 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whoLabel: { ...text(600, 12), color: colors.text2 },
  amount: {
    ...text(700, 15),
    ...tabular,
    color: colors.text,
    marginLeft: 'auto',
  },
  amountOther: { color: colors.text2 },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 2,
    borderTopWidth: 2,
    borderTopColor: colors.hairline,
    marginTop: 6,
  },
  totalLabel: { ...text(700, 14), color: colors.text },
  totalAmount: {
    ...display(800, 20, -0.5),
    ...tabular,
    color: colors.text,
    marginLeft: 'auto',
  },
});
