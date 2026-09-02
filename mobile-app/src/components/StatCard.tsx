import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, iconSize, radii } from '../theme/tokens';
import { display, tabular, text } from '../theme/typography';
import { shadowSm } from '../theme/shadows';

/** `.stat` / `.stat.alert` / `.stat-ic` / `.stat-n` — M18's overview grid. */
export const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  iconColor,
  iconBackground,
  /** `.stat.alert` — a 1.5px overdue border and overdue ink on the number. */
  alert = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  iconColor: string;
  iconBackground: string;
  alert?: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.card, alert ? styles.alert : null]}
    >
      <View style={styles.top}>
        <View style={[styles.well, { backgroundColor: iconBackground }]}>
          <Icon size={iconSize.stat} color={iconColor} strokeWidth={2} />
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.value, alert ? styles.valueAlert : null]}>
        {value}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.r2,
    padding: 16,
    ...shadowSm,
  },
  alert: { borderWidth: 1.5, borderColor: colors.stOverdue },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  well: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...text(600, 14), color: colors.text2, flexShrink: 1 },
  value: {
    ...display(800, 32, -1),
    ...tabular,
    color: colors.text,
    marginTop: 10,
  },
  valueAlert: { color: colors.stOverdueInk },
});
