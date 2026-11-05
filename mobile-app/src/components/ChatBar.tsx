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

export interface ChatDraftAttachment {
  key: string;
  name: string;
  type: string;
  previewUri: string;
}

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
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  bottomInset: number;
  style?: StyleProp<ViewStyle>;
  onAttach?: () => void;
  attachment?: ChatDraftAttachment | null;
  onRemoveAttachment?: () => void;
  attaching?: boolean;
}) {
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
      {onAttach ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add an attachment"
          accessibilityState={{ disabled: attaching || !!attachment }}
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
