import React, { memo } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Paperclip, Send } from 'lucide-react-native';
import { chrome, colors, radii } from '../theme/tokens';
import { text } from '../theme/typography';

/**
 * `.chatbar` — the compose bar, identical on M12 and M13 (§6.3).
 *
 * Pinned to the bottom of `.scr` and rides the keyboard; the screen owns the
 * `KeyboardAvoidingView` and passes the residual bottom gutter in, because that
 * gutter has to collapse to zero while the keyboard is up or the KAV's padding
 * stacks on top of it and leaves a dead band above the keys.
 */
export const ChatBar = memo(function ChatBar({
  placeholder,
  value,
  onChangeText,
  onSend,
  bottomInset,
  style,
}: {
  /** 'Message…' on M12, 'Add a note…' on M13. */
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  bottomInset: number;
  style?: StyleProp<ViewStyle>;
}) {
  const empty = value.trim().length === 0;

  return (
    <View style={[styles.bar, { paddingBottom: 10 + bottomInset }, style]}>
      {/*
        The frame draws a paperclip but no attach flow is designed anywhere in
        the graph and `ChatRepo.send` carries no attachment. It renders as the
        glyph it is rather than as a button that swallows a tap and does
        nothing.
        ponytail: make it a Pressable calling `pickPhoto` the day `send` takes
        an attachment URI — the bubble already renders `.b-att`.
      */}
      <View importantForAccessibility="no-hide-descendants">
        <Paperclip size={24} color={colors.text2} strokeWidth={2} />
      </View>

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={placeholder}
        multiline
        returnKeyType="default"
        blurOnSubmit={false}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: empty }}
        disabled={empty}
        onPress={onSend}
        style={({ pressed }) => [
          styles.send,
          // Visible and dimmed, never hidden — the same locked idiom the step
          // buttons use, so an empty box reads as "nothing to send" rather
          // than as a broken control.
          empty ? styles.sendLocked : null,
          pressed && !empty ? styles.pressed : null,
        ]}
      >
        <Send size={18} color={colors.onNavy} strokeWidth={2} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  // `.chatbar { padding: 10px 14px; gap: 8px }`
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  // `.chatbar .ci`
  input: {
    ...text(500, 14),
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.pill,
    paddingVertical: 11,
    paddingHorizontal: 16,
    color: colors.text,
    includeFontPadding: false,
  },
  // `.chatbar .cb`
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendLocked: { opacity: chrome.lockedOpacity },
  pressed: { opacity: 0.86 },
});
