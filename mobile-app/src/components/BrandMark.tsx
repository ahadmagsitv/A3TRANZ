import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import { display } from '../theme/typography';

const LOGO = require('../../assets/images/a3-mark.png');

export const BrandMark = memo(function BrandMark({
  variant,
}: {
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
