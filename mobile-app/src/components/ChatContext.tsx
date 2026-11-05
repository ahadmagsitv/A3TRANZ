import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Briefcase } from 'lucide-react-native';
import { colors } from '../theme/tokens';
import { tabular, text } from '../theme/typography';

export const ChatContext = memo(function ChatContext({
  jobId,
  jobTitle,
  onPress,
}: {
  jobId: string;
  jobTitle: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Briefcase size={15} color={colors.stProgress} strokeWidth={2} />
      <Text style={styles.label} numberOfLines={1}>
        Job #{jobId} · {jobTitle}
      </Text>
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Job ${jobId}, ${jobTitle}. Open job notes.`}
      onPress={onPress}
      style={({ pressed }) => [styles.ctx, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.ctx}>{body}</View>
  );
});

const styles = StyleSheet.create({
  ctx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  pressed: { backgroundColor: colors.surface3 },
  label: { ...text(600, 13), ...tabular, color: colors.text2, flexShrink: 1 },
});
