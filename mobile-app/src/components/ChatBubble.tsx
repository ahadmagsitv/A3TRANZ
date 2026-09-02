import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';
import { text } from '../theme/typography';
import type { Message } from '../data/contracts';

/** `.bubble` / `.b-me` / `.b-them` / `.b-att` / `.b-time` */
export const ChatBubble = memo(function ChatBubble({
  message,
}: {
  message: Message;
}) {
  const mine = message.from === 'me';
  return (
    <View style={mine ? styles.wrapMe : styles.wrapThem}>
      <View style={[styles.bubble, mine ? styles.me : styles.them]}>
        {message.attachmentUri ? (
          <Image
            accessibilityLabel="Message attachment"
            source={{ uri: message.attachmentUri }}
            style={styles.attachment}
          />
        ) : null}
        <Text style={[styles.body, mine ? styles.bodyMe : styles.bodyThem]}>
          {message.body}
        </Text>
      </View>
      <Text style={[styles.time, mine ? styles.timeMe : null]}>
        {message.whenLabel}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapMe: { alignSelf: 'flex-end', maxWidth: '78%' },
  wrapThem: { alignSelf: 'flex-start', maxWidth: '78%' },
  bubble: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16 },
  them: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderBottomLeftRadius: 5,
  },
  me: { backgroundColor: colors.navy, borderBottomRightRadius: 5 },
  body: { ...text(500, 14), lineHeight: 20 },
  bodyThem: { color: colors.text },
  bodyMe: { color: colors.onNavy },
  attachment: {
    width: 150,
    height: 96,
    borderRadius: 10,
    backgroundColor: colors.surface3,
    marginBottom: 8,
  },
  /**
   * `.b-time` is `--muted` in the frame; §7 gate 1 forbids `--muted` as copy
   * (2.6:1), so the timestamp takes `--text-2` (5:1). Logged deviation.
   */
  time: { ...text(500, 11), color: colors.text2, marginTop: 4 },
  timeMe: { textAlign: 'right' },
});
