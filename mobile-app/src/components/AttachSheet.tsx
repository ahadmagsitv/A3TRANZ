import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, FileText, Image as ImageIcon } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radii } from '../theme/tokens';
import { text } from '../theme/typography';
import { Sheet } from './Sheet';

export type AttachChoice = 'library' | 'camera' | 'document';

/**
 * The attach menu — the same three choices the web composer offers, in the
 * idiom this app already has for a menu (`Sheet`, as M20's delete uses).
 *
 * An `Alert` was doing this job. Three buttons in a system alert is a dialog
 * pretending to be a menu: no icons, no ordering control, and a different
 * shape from the same menu on the console.
 */
export const AttachSheet = memo(function AttachSheet({
  visible,
  onDismiss,
  onChoose,
}: {
  visible: boolean;
  onDismiss: () => void;
  onChoose: (choice: AttachChoice) => void;
}) {
  const options: { choice: AttachChoice; label: string; icon: LucideIcon }[] = [
    { choice: 'library', label: 'Photo or image', icon: ImageIcon },
    { choice: 'camera', label: 'Take a photo', icon: Camera },
    { choice: 'document', label: 'PDF or file', icon: FileText },
  ];

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Add an attachment">
      {options.map(({ choice, label, icon: Icon }) => (
        <Pressable
          key={choice}
          accessibilityRole="button"
          accessibilityLabel={label}
          // Dismiss FIRST: on iOS a picker presented while the sheet is still
          // up gets no window to present in and never opens.
          onPress={() => {
            onDismiss();
            onChoose(choice);
          }}
          style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        >
          <View style={styles.well}>
            <Icon size={18} color={colors.text} strokeWidth={2} />
          </View>
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={onDismiss}
        style={({ pressed }) => [styles.cancel, pressed ? styles.pressed : null]}
      >
        <Text style={styles.cancelLabel}>Cancel</Text>
      </Pressable>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radii.r,
  },
  pressed: { backgroundColor: colors.surface2 },
  well: {
    width: 38,
    height: 38,
    borderRadius: radii.r,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...text(600, 15), color: colors.text },
  cancel: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
  },
  cancelLabel: { ...text(700, 15), color: colors.text2 },
});
