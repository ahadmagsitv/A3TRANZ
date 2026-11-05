import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Download, FileText, X } from 'lucide-react-native';
import { colors, radii, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import type { JobAttachment } from '../data/contracts';

export const FileChip = memo(function FileChip({
  attachment,
  onPress,
  onDownload,
  onRemove,
  showOrigin = false,
}: {
  attachment: JobAttachment;
  onPress?: () => void;
  onDownload?: () => void;
  onRemove?: () => void;
  showOrigin?: boolean;
}) {
  const meta = showOrigin
    ? `${attachment.size} · ${
        attachment.origin === 'admin' ? 'from Admin' : 'from you'
      }`
    : attachment.size;

  const Glyph = onRemove ? X : Download;
  const action = onRemove ?? onDownload;
  const actionLabel = onRemove
    ? `Remove ${attachment.name}`
    : `Download ${attachment.name}`;

  const body = (
    <>
      <View style={styles.well}>
        <FileText size={18} color={colors.stProgress} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="middle">
          {attachment.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {onPress || !action ? (
        <Glyph size={18} color={colors.text2} strokeWidth={2} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={12}
          onPress={action}
        >
          <Glyph size={18} color={colors.text2} strokeWidth={2} />
        </Pressable>
      )}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${attachment.name}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.chip}>{body}</View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r,
    marginTop: 10,
  },
  pressed: { backgroundColor: colors.surface2 },
  well: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: tint.fileIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  name: { ...text(600, 14), color: colors.text },
  meta: { ...text(500, 12), color: colors.text2 },
});
