import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import { display } from '../theme/typography';

const LOGO = require('../../assets/images/a3-mark.png');

/**
 * The A3 Transport mark.
 *
 * The supplied artwork is the A3 glyph in brand blue with a near-WHITE
 * wordmark, so it only reads on a light ground — on the app's navy the blue
 * goes muddy and on white the word's second half disappears entirely. The mark
 * therefore always sits on a white tile, and `lockup` keeps TRANSPORT as the
 * type it already was rather than shipping a wordmark that renders as
 * "A3 TRANS".
 *
 * ponytail: drop in a light-on-dark variant and the lockup can use the
 * artwork's own wordmark — only this file changes.
 */
export const BrandMark = memo(function BrandMark({
  variant,
}: {
  /** `lockup` = M1 splash, on navy. `mark` = M2 square app mark. */
  variant: 'lockup' | 'mark';
}) {
  if (variant === 'mark') {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="A3 Transport"
        style={styles.mark}
      >
        <Image source={LOGO} style={styles.markImage} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="A3 Transport"
      style={styles.lockup}
    >
      <View style={styles.lockupTile}>
        <Image source={LOGO} style={styles.lockupImage} resizeMode="contain" />
      </View>
      <Text style={styles.lockupWord}>TRANSPORT</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  // M2 — 50×50
  mark: {
    width: 50,
    height: 50,
    borderRadius: radii.r,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markImage: { width: 36, height: 36 },

  // M1 — 152px wide
  lockup: { width: 152, alignItems: 'center' },
  lockupTile: {
    width: 108,
    height: 108,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockupImage: { width: 78, height: 78 },
  lockupWord: {
    ...display(600, 11, 4),
    color: colors.onNavy,
    marginTop: 14,
  },
});
