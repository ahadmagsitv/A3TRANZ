import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import { display } from '../theme/typography';

/**
 * ⚠ PLACEHOLDER — the real artwork is missing from the handoff.
 *
 * `M1-launch` renders `assets/a3-lockup-white.png` at 152px wide and `M2`
 * renders `assets/a3-mark.png` at 50×50. Neither file ships with
 * `a3tranz-mobile-all.html` (there is no `assets/` folder beside it), so this
 * is a type-only stand-in at the exact frame dimensions.
 *
 * ponytail: drop the two PNGs into `assets/images/` and swap both branches for
 * an `<Image>` — the callers and the layout boxes do not change. Do this
 * before the client sees a build; a wordmark is not a logo.
 */
export const BrandMark = memo(function BrandMark({
  variant,
}: {
  /** `lockup` = M1 splash, white on navy. `mark` = M2 square app mark. */
  variant: 'lockup' | 'mark';
}) {
  if (variant === 'mark') {
    return (
      <View accessibilityRole="image" accessibilityLabel="A3 Transport" style={styles.mark}>
        <Text style={styles.markText}>A3</Text>
      </View>
    );
  }
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="A3 Transport"
      style={styles.lockup}
    >
      <Text style={styles.lockupA3}>A3</Text>
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
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { ...display(800, 20, -0.4), color: colors.onNavy },

  // M1 — 152px wide
  lockup: { width: 152, alignItems: 'center' },
  lockupA3: { ...display(900, 46, -1.5), color: colors.onNavy },
  lockupWord: { ...display(600, 11, 4), color: colors.onNavy, marginTop: 2 },
});
