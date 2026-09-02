import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import { colors, iconSize, radii, tint } from '../theme/tokens';
import { text } from '../theme/typography';

/**
 * `.thumb` / `.del` / `.ov` / `.progress` — the M8 and M10 grid tile.
 *
 * `onRequestDelete` is DRIVER-ONLY. Photos are deletable by the driver;
 * documents are not (§8 Q5). The admin never gets a delete control — a `.pdel`
 * or `.del` rendered in an admin frame is a bug (§6.2).
 */
export const Thumb = memo(function Thumb({
  uri,
  alt,
  uploadProgress,
  onPress,
  onRequestDelete,
}: {
  uri?: string | null;
  alt?: string;
  /** 0–100 while uploading. No delete control until it lands. */
  uploadProgress?: number | null;
  onPress?: () => void;
  onRequestDelete?: () => void;
}) {
  const uploading = uploadProgress !== null && uploadProgress !== undefined;
  return (
    <Pressable
      accessibilityRole="image"
      accessibilityLabel={alt ?? 'Job photo'}
      onPress={onPress}
      style={styles.thumb}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.image} />
      ) : (
        <Camera size={22} color={colors.muted} strokeWidth={2} />
      )}
      {uploading ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{uploadProgress}%</Text>
        </View>
      ) : null}
      {onRequestDelete && !uploading ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${alt ?? 'photo'}`}
          hitSlop={11}
          onPress={onRequestDelete}
          style={styles.del}
        >
          <X
            size={iconSize.photoDelete}
            color={colors.onNavy}
            strokeWidth={2.5}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

/** `.progress` — the amber bar under an uploading tile. */
export const ProgressBar = memo(function ProgressBar({
  percent,
}: {
  percent: number;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.progress}
    >
      <View
        style={[
          styles.progressFill,
          { width: `${Math.min(100, Math.max(0, percent))}%` },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  thumb: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.r,
    overflow: 'hidden',
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
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
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tint.photoBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.amber,
  },
});
