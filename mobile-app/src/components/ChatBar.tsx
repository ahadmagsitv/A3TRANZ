import React, { memo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FileText, Paperclip, Send, X } from 'lucide-react-native';
import { chrome, colors, radii } from '../theme/tokens';
import { text } from '../theme/typography';

/** What the bar is holding: picked and uploaded, not yet sent. */
export interface ChatDraftAttachment {
  key: string;
  name: string;
  type: string;
  /** The local uri, so the preview shows before the message exists. */
  previewUri: string;
}

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
  onAttach,
  attachment,
  onRemoveAttachment,
  attaching = false,
}: {
  /** 'Message…' on M12, 'Add a note…' on M13. */
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  bottomInset: number;
  style?: StyleProp<ViewStyle>;
  /** Omit to keep the paperclip inert — notes (M13) carry no attachment. */
  onAttach?: () => void;
  attachment?: ChatDraftAttachment | null;
  onRemoveAttachment?: () => void;
  attaching?: boolean;
}) {
  // An attachment IS a message: a photo with no caption still sends.
  const empty = value.trim().length === 0 && !attachment;
  const isImage = (attachment?.type ?? '').startsWith('image/');

  return (
    <View style={[styles.bar, { paddingBottom: 10 + bottomInset }, style]}>
      {attachment ? (
        <View style={styles.draft}>
          {isImage ? (
            <Image
              source={{ uri: attachment.previewUri }}
              style={styles.draftThumb}
              accessibilityLabel={attachment.name}
            />
          ) : (
            <View style={styles.draftThumb}>
              <FileText size={18} color={colors.muted} strokeWidth={2} />
            </View>
          )}
          <View style={styles.draftBody}>
            <Text style={styles.draftName} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Text style={styles.draftHint} numberOfLines={1}>
              Attached · add a message, or send as is
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${attachment.name}`}
            hitSlop={10}
            onPress={onRemoveAttachment}
            style={styles.draftRemove}
          >
            <X size={16} color={colors.text2} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.row}>
      {/* The paperclip is a real control where a thread can carry a file, and
          the inert glyph the frame drew where it cannot (M13 notes). */}
      {onAttach ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add an attachment"
          accessibilityState={{ disabled: attaching || !!attachment }}
          // One per message: a second would silently replace the first, and
          // the chip has room to admit to only one.
          disabled={attaching || !!attachment}
          onPress={onAttach}
          hitSlop={8}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
        >
          {attaching ? (
            <ActivityIndicator size="small" color={colors.text2} />
          ) : (
            <Paperclip
              size={24}
              color={attachment ? colors.placeholder : colors.text2}
              strokeWidth={2}
            />
          )}
        </Pressable>
      ) : (
        <View importantForAccessibility="no-hide-descendants">
          <Paperclip size={24} color={colors.text2} strokeWidth={2} />
        </View>
      )}

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
    </View>
  );
});

const styles = StyleSheet.create({
  // `.chatbar { padding: 10px 14px; gap: 8px }` — a column now, so the draft
  // chip can sit above the row rather than squeezing the input.
  bar: {
    paddingTop: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r,
    backgroundColor: colors.surface2,
  },
  draftThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBody: { flex: 1, minWidth: 0 },
  draftName: { ...text(600, 13), color: colors.text },
  draftHint: { ...text(500, 11), color: colors.text2, marginTop: 2 },
  draftRemove: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
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
