import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import { colors, radii, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import type { Priority } from '../data/contracts';

const TONE: Record<Priority, { bg: string; ink: string; label: string }> = {
  high: { bg: tint.priHigh, ink: colors.stOverdueInk, label: 'High' },
  // Amber as a FILL with --amber-ink text. Never amber as text on white.
  medium: { bg: tint.priMed, ink: colors.amberInk, label: 'Medium' },
  low: { bg: tint.priLow, ink: colors.text2, label: 'Low' },
};

export const PriorityTag = memo(function PriorityTag({
  priority,
}: {
  priority: Priority;
}) {
  const t = TONE[priority];
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]}>
      <Flag size={12} color={t.ink} strokeWidth={2} />
      <Text style={[styles.label, { color: t.ink }]}>{t.label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.r,
    alignSelf: 'flex-start',
  },
  label: { ...text(700, 11) },
});
