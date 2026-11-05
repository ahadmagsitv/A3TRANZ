import React, { memo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../theme/tokens';
import { display, tabular, text } from '../theme/typography';

export const formatMoney = (amount: number): string =>
  `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const Money = memo(function Money({
  amount,
  size = 'md',
  style,
}: {
  amount: number;
  size?: 'md' | 'lg';
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      numberOfLines={1}
      style={[size === 'lg' ? styles.lg : styles.md, style]}
    >
      {formatMoney(amount)}
    </Text>
  );
});

const styles = StyleSheet.create({
  md: { ...text(700, 15, -0.2), ...tabular, color: colors.text },
  lg: { ...display(800, 32, -1), ...tabular, color: colors.text },
});
