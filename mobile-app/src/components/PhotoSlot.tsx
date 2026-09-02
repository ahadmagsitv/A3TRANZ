import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, CheckCircle2, PlusCircle, Trash2 } from 'lucide-react-native';
import { colors, iconSize, radii, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import type { PhotoSlot as PhotoSlotModel } from '../data/contracts';

export interface PhotoSlotProps {
  slot: PhotoSlotModel;
  onCapture: () => void;
  /** Delete ALWAYS confirms first — the caller opens the sheet (§6.2). */
  onRequestDelete: () => void;
}

/**
 * `.pslot` / `.blank` / `.pdel` / `.pk` — §6.2.
 *
 *   Blank     → dashed border, camera glyph, plus-circle mark, "Tap to capture".
 *               NO delete control — there is nothing to remove.
 *   Uploading → thumbnail with a % overlay. NO delete — not uploaded yet.
 *   Captured  → thumbnail, solid border, check-circle-2 mark, `.pdel` badge.
 *
 * `.pdel` is a 22px badge in the TOP-RIGHT CORNER of the thumbnail, not a
 * trailing button: a trailing control steals ~38px from the text column and
 * wraps the label at 393px. Deliberate — do not "improve" it.
 */
export const PhotoSlot = memo(function PhotoSlot({
  slot,
  onCapture,
  onRequestDelete,
}: PhotoSlotProps) {
  const uploading = slot.uploadProgress !== null && slot.uri !== null;
  const captured = slot.uri !== null && !uploading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        captured ? `${slot.label}, captured` : `${slot.label}, tap to capture`
      }
      onPress={captured ? undefined : onCapture}
      style={[styles.slot, slot.uri === null ? styles.slotBlank : null]}
    >
      <View style={[styles.shot, slot.uri === null ? styles.shotBlank : null]}>
        {slot.uri ? (
          <Image source={{ uri: slot.uri }} style={styles.image} />
        ) : (
          <Camera size={18} color={colors.muted} strokeWidth={2} />
        )}
        {uploading ? (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>{slot.uploadProgress}%</Text>
          </View>
        ) : null}
        {captured ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete photo: ${slot.label}`}
            hitSlop={11}
            onPress={onRequestDelete}
            style={styles.del}
          >
            <Trash2
              size={iconSize.photoDelete}
              color={colors.onNavy}
              strokeWidth={2.5}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {slot.label}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {slot.hint}
        </Text>
      </View>

      {captured ? (
        <CheckCircle2 size={19} color={colors.stDone} strokeWidth={2} />
      ) : (
        <PlusCircle size={19} color={colors.muted} strokeWidth={2} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.r,
    marginBottom: 8,
  },
  slotBlank: { borderStyle: 'dashed', borderColor: colors.border },
  shot: {
    width: 74,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotBlank: {
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  image: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tint.photoOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: { ...text(700, 12), color: colors.onNavy },
  del: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tint.photoBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { ...text(600, 14, -0.1), color: colors.text },
  meta: { ...text(500, 12), color: colors.text2, marginTop: 3, lineHeight: 16 },
});
