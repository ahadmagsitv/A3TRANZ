import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, iconSize } from '../theme/tokens';
import { display, text } from '../theme/typography';

export const Empty = memo(function Empty({
  icon: Icon,
  title,
  body,
  action,
  actionMarginTop = 14,
  circleColor,
  iconColor,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  actionMarginTop?: number;
  circleColor?: string;
  iconColor?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.circle,
          circleColor ? { backgroundColor: circleColor } : null,
        ]}
      >
        <Icon
          size={iconSize.empty}
          color={iconColor ?? colors.muted}
          strokeWidth={2}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <View style={[styles.action, { marginTop: actionMarginTop }]}>
          {action}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 40,
    gap: 6,
  },
  circle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { ...display(800, 18), color: colors.text, textAlign: 'center' },
  body: {
    ...text(500, 14),
    color: colors.text2,
    maxWidth: 220,
    textAlign: 'center',
  },
  action: { alignSelf: 'stretch', alignItems: 'center' },
});
