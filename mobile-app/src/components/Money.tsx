import React, { memo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../theme/tokens';
import { display, tabular, text } from '../theme/typography';

/**
 * `.money` / `.money-lg` — §6.7.
 *
 * EVERY rendered amount goes through this component. It is always tabular and
 * always `--text` ink: NEVER green, NEVER amber. Payment state lives in a
 * StatusPill beside the number, never in the number's colour. This is the QA
 * gate that is easiest to fail by accident.
 */
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
  /** 'lg' = `.money-lg` (Outfit 900/32). 'md' inherits the caller's size. */
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
