import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Building2,
  ChevronRight,
  MapPin,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, iconSize, radii, tint } from '../theme/tokens';
import { tabular, text } from '../theme/typography';
import { StatusPill, toneForStatus, type PillTone } from './StatusPill';
import { PriorityTag } from './PriorityTag';
import { JobTypeChip } from './JobTypeChip';
import type { Job } from '../data/contracts';

const CARD: Record<PillTone, { bg: string; border: string }> = {
  pending: tint.cardPending,
  progress: tint.cardProgress,
  review: tint.cardReview,
  done: tint.cardDone,
  overdue: tint.cardOverdue,
};

const STATUS_LABEL: Record<PillTone, string> = {
  pending: 'Pending',
  progress: 'In Progress',
  review: 'Awaiting approval',
  done: 'Done',
  overdue: 'Overdue',
};

/** One trailing `.jcard-meta` item — the calendar / clock / camera / paperclip. */
export interface JobCardMeta {
  icon: LucideIcon;
  label: string;
}

/** `.jcard` — status-tinted. The tint IS the status; never a translucency cue. */
export const JobCard = memo(function JobCard({
  job,
  onPress,
  /** Right-hand text in `.jcard-top` — a due time, a date, or the job id. */
  trailing,
  statusLabel,
  showPriority = true,
  showLocation = true,
  showTruck = false,
  meta,
  chevron,
  children,
}: {
  job: Job;
  onPress?: () => void;
  trailing?: string;
  statusLabel?: string;
  showPriority?: boolean;
  /** M17's history cards drop the `map-pin` — where it went stopped mattering. */
  showLocation?: boolean;
  /** Only M18's up-next card puts the truck in its meta row. */
  showTruck?: boolean;
  /** Appended after the location. Varies per list — see each frame. */
  meta?: JobCardMeta[];
  /**
   * `.stack .jcard` is the disclosure row: it draws the `::after` chevron AND
   * reserves 38px for it. The two always travel together, so one flag drives
   * both. M18's card is tappable but sits outside a `.stack`, so it gets
   * neither.
   */
  chevron?: boolean;
  /** A `<Stepper>` or an action row docked inside the card (M18). */
  children?: React.ReactNode;
}) {
  const tone = toneForStatus(job.status, job.overdue);
  const card = CARD[tone];
  const disclosure = chevron ?? Boolean(onPress);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${STATUS_LABEL[tone]}, ${job.customerName}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        disclosure ? styles.disclosure : null,
        { backgroundColor: card.bg, borderColor: card.border },
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={styles.top}>
        <StatusPill tone={tone} label={statusLabel ?? STATUS_LABEL[tone]} />
        {showPriority ? <PriorityTag priority={job.priority} /> : null}
        <JobTypeChip type={job.type} />
        <Text style={styles.id}>{trailing ?? `#${job.id}`}</Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {job.title}
      </Text>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Building2
            size={iconSize.meta}
            color={colors.muted}
            strokeWidth={2}
          />
          <Text style={styles.metaText} numberOfLines={1}>
            {job.customerName}
          </Text>
        </View>
        {showTruck && job.truckId ? (
          <View style={styles.metaItem}>
            <Truck size={iconSize.meta} color={colors.muted} strokeWidth={2} />
            <Text style={[styles.metaText, tabular]}>{job.truckId}</Text>
          </View>
        ) : null}
        {showLocation ? (
          <View style={styles.metaItem}>
            <MapPin size={iconSize.meta} color={colors.muted} strokeWidth={2} />
            <Text style={styles.metaText} numberOfLines={1}>
              {job.location}
            </Text>
          </View>
        ) : null}
        {meta?.map(({ icon: Glyph, label }) => (
          <View key={label} style={styles.metaItem}>
            <Glyph size={iconSize.meta} color={colors.muted} strokeWidth={2} />
            <Text style={[styles.metaText, tabular]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {children}

      {disclosure ? (
        <ChevronRight
          size={16}
          color={colors.muted}
          strokeWidth={2.5}
          style={styles.chevron}
        />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.r2,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  /* `.stack .jcard` reserves 38px on the right for the disclosure chevron. */
  disclosure: { paddingRight: 38 },
  pressed: { transform: [{ scale: 0.99 }] },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  id: { ...text(600, 12), ...tabular, color: colors.text2, marginLeft: 'auto' },
  title: { ...text(700, 17, -0.3), color: colors.text, marginBottom: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { ...text(500, 13), color: colors.text2, flexShrink: 1 },
  chevron: { position: 'absolute', right: 15, top: '50%', marginTop: -8 },
});
