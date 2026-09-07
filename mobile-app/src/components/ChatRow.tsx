import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Briefcase, MessageSquare } from 'lucide-react-native';
import { colors, radii } from '../theme/tokens';
import { display, tabular, text } from '../theme/typography';
import type { Thread } from '../data/contracts';

/**
 * `.chatrow` / `.unread` / `.bdg` — M27.
 * Threads are job-scoped; the Chat tab opens this LIST, never a thread (§6.8).
 */
export const ChatRow = memo(function ChatRow({
  thread,
  onPress,
  last = false,
}: {
  thread: Thread;
  onPress: () => void;
  last?: boolean;
}) {
  const unread = thread.unread > 0;
  // Whichever of the two the thread is ABOUT leads. A job thread is about the
  // job, so the job is the title and the person is the detail under it; a
  // direct thread is about the person, so that swaps.
  const job = thread.jobId
    ? `#${thread.jobId} · ${thread.jobTitle ?? ''}`
    : null;
  const title = job ?? thread.adminLabel;
  const subtitle = job ? thread.adminLabel : 'Direct message';
  const SubIcon = job ? Briefcase : MessageSquare;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread
          ? `${title}, ${subtitle}, ${thread.unread} unread. ${thread.preview}`
          : `${title}, ${subtitle}. ${thread.preview}`
      }
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{thread.adminInitials}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.when}>{thread.whenLabel}</Text>
        </View>
        {/* `.cj i` is 13px `--muted` — the briefcase when this line is a job,
            and the speech bubble when it is not, so the glyph never promises a
            job that is not there. */}
        <View style={styles.job}>
          <SubIcon size={13} color={colors.muted} strokeWidth={2} />
          <Text style={styles.jobText} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Text
          style={[styles.preview, unread ? styles.previewUnread : null]}
          numberOfLines={1}
        >
          {thread.preview}
        </Text>
      </View>

      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{thread.unread}</Text>
        </View>
      ) : null}
      {/* `.chatrow::after` — inset to 64px, clearing the avatar. */}
      {last ? null : <View style={styles.divider} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  divider: {
    position: 'absolute',
    left: 64,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  pressed: { backgroundColor: colors.surface2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...display(800, 13), color: colors.onNavy },
  body: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...text(700, 15), color: colors.text, flexShrink: 1 },
  when: {
    ...text(500, 12),
    ...tabular,
    color: colors.text2,
    marginLeft: 'auto',
  },
  job: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  jobText: { ...text(600, 12), ...tabular, color: colors.text2, flexShrink: 1 },
  preview: { ...text(500, 13), color: colors.text2, marginTop: 4 },
  previewUnread: { ...text(600, 13), color: colors.text },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.sel,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginTop: 6,
  },
  badgeText: { ...text(700, 11), color: colors.onNavy },
});
