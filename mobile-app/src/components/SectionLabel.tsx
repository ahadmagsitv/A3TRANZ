import React, { memo } from 'react';
import {
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { colors } from '../theme/tokens';
import { text } from '../theme/typography';

/**
 * `.sect-lbl { font:700 12px --f; uppercase; letter-spacing:.5px;
 *              margin:18px 18px 8px }`
 *
 * The frames override the margin inline (M24/M25 zero the top and left), so the
 * default is the CSS rule and the override is a style prop.
 */
export const SectionLabel = memo(function SectionLabel({
  label,
  style,
}: {
  label: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text accessibilityRole="header" style={[styles.label, style]}>
      {label.toUpperCase()}
    </Text>
  );
});

const styles = StyleSheet.create({
  label: {
    ...text(700, 12, 0.5),
    color: colors.text2,
    marginTop: 18,
    marginHorizontal: 18,
    marginBottom: 8,
  },
});
