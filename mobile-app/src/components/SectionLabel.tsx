import React, { memo } from 'react';
import {
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { colors } from '../theme/tokens';
import { text } from '../theme/typography';

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
