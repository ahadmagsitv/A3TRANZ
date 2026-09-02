import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Briefcase } from 'lucide-react-native';
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread
          ? `${thread.adminLabel}, ${thread.unread} unread. ${thread.preview}`
          : `${thread.adminLabel}. ${thread.preview}`
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
            {thread.adminLabel}
          </Text>
          <Text style={styles.when}>{thread.whenLabel}</Text>
        </View>
        {/* `.cj i` is `briefcase`, 13px, `--muted`. */}
        <View style={styles.job}>
          <Briefcase size={13} color={colors.muted} strokeWidth={2} />
          <Text style={styles.jobText} numberOfLines={1}>
            #{thread.jobId} · {thread.jobTitle}
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
