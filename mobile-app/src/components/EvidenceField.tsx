import React, { memo } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, type LucideIcon } from 'lucide-react-native';
import { colors, radii } from '../theme/tokens';
import { tabular, text } from '../theme/typography';

/**
 * `.evid` — a number and the photo that proves it.
 *
 * §8 Q1 (RESOLVED): the Seal no. row is a REAL controlled text input, and
 * Confirm pickup unlocks only at 2 photos AND a non-empty seal number. Pass
 * `onChangeText` to make the row editable; omit it for a read-only number.
 */
export const EvidenceField = memo(function EvidenceField({
  icon: Icon,
  label,
  value,
  placeholder,
  onChangeText,
  photoUri,
  onSubmitEditing,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  placeholder?: string;
  onChangeText?: (next: string) => void;
  photoUri?: string | null;
  onSubmitEditing?: () => void;
}) {
  const blank = value.trim().length === 0;
  const editable = onChangeText !== undefined;

  return (
    <View style={[styles.evid, blank ? styles.blank : null]}>
      <View style={styles.well}>
        <Icon size={18} color={colors.navy} strokeWidth={2} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {editable ? (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            /* Short field: dismiss the keyboard, do NOT submit the step —
               the step button is a separate, deliberate tap (§6.3). */
            returnKeyType="done"
            onSubmitEditing={onSubmitEditing}
            accessibilityLabel={label}
            style={[styles.value, blank ? styles.valueBlank : null]}
          />
        ) : (
          <Text style={[styles.value, blank ? styles.valueBlank : null]}>
            {blank ? placeholder ?? '—' : value}
          </Text>
        )}
      </View>

      <View style={styles.shot}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.image} />
        ) : (
          <Camera size={15} color={colors.muted} strokeWidth={2} />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  evid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r,
    marginBottom: 8,
  },
  blank: { borderStyle: 'dashed', borderColor: colors.border },
  well: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  label: { ...text(600, 12), color: colors.text2 },
  value: {
    ...text(700, 15, -0.2),
    ...tabular,
    color: colors.text,
    marginTop: 2,
    padding: 0,
  },
  valueBlank: { ...text(500, 15, -0.2), color: colors.placeholder },
  shot: {
    width: 44,
    height: 34,
    borderRadius: 7,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
});
