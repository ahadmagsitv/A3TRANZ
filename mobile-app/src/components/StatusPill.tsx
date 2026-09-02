import React, { memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import type { JobStatus } from '../data/contracts';

/** `.spill` tones — sp-pending / -progress / -review / -done / -overdue. */
export type PillTone = 'pending' | 'progress' | 'review' | 'done' | 'overdue';

const TONE: Record<PillTone, { bg: string; ink: string; dot: string }> = {
  pending: {
    bg: tint.pillPending,
    ink: colors.stPendingInk,
    dot: colors.stPending,
  },
  progress: {
    bg: tint.pillProgress,
    ink: colors.stProgressInk,
    dot: colors.stProgress,
  },
  review: {
    bg: tint.pillReview,
    ink: colors.stReviewInk,
    dot: colors.stReview,
  },
  done: { bg: tint.pillDone, ink: colors.stDoneInk, dot: colors.stDone },
  overdue: {
    bg: tint.pillOverdue,
    ink: colors.stOverdueInk,
    dot: colors.stOverdue,
  },
};

/** Status carried by colour + label, never by translucency (§1.6). */
export const toneForStatus = (status: JobStatus, overdue = false): PillTone => {
  if (overdue && status !== 'done') {
    return 'overdue';
  }
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
      return 'progress';
    case 'blocked':
      return 'overdue';
    case 'awaiting_approval':
      return 'review';
    case 'done':
      return 'done';
  }
};

export const StatusPill = memo(function StatusPill({
  tone,
  label,
  style,
}: {
  tone: PillTone;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text numberOfLines={1} style={[styles.label, { color: t.ink }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { ...text(700, 11, 0.3) },
});
