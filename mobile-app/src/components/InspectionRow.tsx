import React, { memo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AlertTriangle, Camera, Check, X } from 'lucide-react-native';
import { colors, radii, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import type { InspectionItem, InspectionResult } from '../data/contracts';

export interface InspectionRowProps {
  item: InspectionItem;
  onResult: (result: InspectionResult) => void;
  onNoteChange: (note: string) => void;
  /** §6.3 — the caller scrolls the row PLUS its note into view as one unit. */
  onNoteFocus?: () => void;
  /** Where the caller commits the note through the state machine. */
  onNoteBlur?: () => void;
  onAddPhoto?: () => void;
}

/**
 * `.insp` + `.inote` — one item of the 12-row DOT pre-trip.
 *
 * A Defect docks a REQUIRED note beneath the row and the row loses its bottom
 * radius so the two read as one card. A ✗ with no note is an invalid state and
 * the state machine rejects it — this component renders the requirement, it is
 * not the thing that enforces it (§6.1).
 */
export const InspectionRow = memo(function InspectionRow({
  item,
  onResult,
  onNoteChange,
  onNoteFocus,
  onNoteBlur,
  onAddPhoto,
}: InspectionRowProps) {
  const failed = item.result === 'defect';
  const passed = item.result === 'pass';

  return (
    <View>
      <View
        style={[
          styles.row,
          passed ? styles.rowPass : null,
          failed ? styles.rowFail : null,
        ]}
      >
        <Text style={styles.label} numberOfLines={2}>
          {item.label}
        </Text>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={`${item.label}: pass`}
            accessibilityState={{ selected: passed }}
            onPress={() => onResult('pass')}
            style={[styles.mark, passed ? styles.markPass : null]}
          >
            <Check
              size={16}
              color={passed ? colors.onNavy : colors.muted}
              strokeWidth={2.5}
            />
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={`${item.label}: defect`}
            accessibilityState={{ selected: failed }}
            onPress={() => onResult('defect')}
            style={[styles.mark, failed ? styles.markFail : null]}
          >
            <X
              size={16}
              color={failed ? colors.onNavy : colors.muted}
              strokeWidth={2.5}
            />
          </Pressable>
        </View>
      </View>

      {failed ? (
        <View style={styles.note}>
          <View style={styles.noteLabel}>
            <AlertTriangle
              size={13}
              color={colors.stOverdueInk}
              strokeWidth={2}
            />
            <Text style={styles.noteLabelText}>DEFECT NOTE</Text>
          </View>
          <TextInput
            value={item.note ?? ''}
            onChangeText={onNoteChange}
            onFocus={onNoteFocus}
            onBlur={onNoteBlur}
            multiline
            /* A note is prose, not a command — no return-key submit (§6.3). */
            blurOnSubmit={false}
            autoCapitalize="sentences"
            accessibilityLabel={`Defect note for ${item.label}`}
            placeholder="Describe the defect — what, where, how bad…"
            placeholderTextColor={colors.placeholder}
            style={styles.noteInput}
          />
          <View style={styles.noteFoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                item.photoUri
                  ? `Replace the defect photo for ${item.label}`
                  : `Add a photo of the defect on ${item.label}`
              }
              onPress={onAddPhoto}
              style={styles.shot}
            >
              {item.photoUri ? (
                <Image source={{ uri: item.photoUri }} style={styles.shotImg} />
              ) : (
                <Camera size={14} color={colors.text2} strokeWidth={2} />
              )}
              <Text style={styles.shotLabel}>
                {item.photoUri ? 'Photo added' : 'Add photo'}
              </Text>
            </Pressable>
            <Text style={styles.required}>Required before reporting</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r,
    marginBottom: 8,
  },
  rowPass: {
    borderColor: tint.inspPass.border,
    backgroundColor: tint.inspPass.bg,
  },
  rowFail: {
    borderColor: tint.inspFail.border,
    backgroundColor: tint.inspFail.bg,
    borderLeftWidth: 4,
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
    paddingBottom: 13,
  },
  label: { ...text(600, 14), color: colors.text, flex: 1 },
  buttons: { flexDirection: 'row', gap: 6 },
  mark: {
    width: 36,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  markPass: { backgroundColor: colors.stDone, borderColor: colors.stDone },
  markFail: {
    backgroundColor: colors.stOverdue,
    borderColor: colors.stOverdue,
  },
  note: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderLeftWidth: 4,
    borderColor: colors.stOverdue,
    borderBottomLeftRadius: radii.r,
    borderBottomRightRadius: radii.r,
    backgroundColor: tint.inspFail.bg,
    paddingHorizontal: 13,
    paddingBottom: 13,
    marginBottom: 8,
  },
  noteLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  noteLabelText: { ...text(700, 11, 0.4), color: colors.stOverdueInk },
  noteInput: {
    minHeight: 62,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.r,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    ...text(500, 14),
    color: colors.text,
  },
  noteFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  shot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shotImg: { width: 18, height: 14, borderRadius: 3 },
  shotLabel: { ...text(600, 12), color: colors.text2 },
  required: {
    ...text(600, 11),
    color: colors.stOverdueInk,
    marginLeft: 'auto',
    textAlign: 'right',
  },
});
