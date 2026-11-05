import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { colors, iconSize, radii } from '../theme/tokens';
import { text } from '../theme/typography';

export const Row = memo(function Row({
  icon: Icon,
  iconColor = colors.navy,
  iconBackground = colors.surface3,
  title,
  subtitle,
  subtitleLabel,
  onPress,
  chevron = false,
  right,
  highlighted = false,
  last = false,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  iconBackground?: string;
  title: string;
  subtitle?: React.ReactNode;
  subtitleLabel?: string;
  onPress?: () => void;
  chevron?: boolean;
  right?: React.ReactNode;
  highlighted?: boolean;
  last?: boolean;
}) {
  const content = (
    <>
      {Icon ? (
        <View style={[styles.well, { backgroundColor: iconBackground }]}>
          <Icon size={iconSize.row} color={iconColor} strokeWidth={2} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? (
        <ChevronRight
          size={iconSize.row}
          color={colors.muted}
          strokeWidth={2}
        />
      ) : null}
      {last ? null : <View style={styles.divider} />}
    </>
  );

  const style = [styles.row, highlighted ? styles.highlighted : null];
  const spoken =
    typeof subtitle === 'string' ? subtitle : subtitle ? subtitleLabel : null;

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken ? `${title}. ${spoken}` : title}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    minHeight: 68,
  },
  divider: {
    position: 'absolute',
    left: 60,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  highlighted: { backgroundColor: colors.infoBg },
  pressed: { backgroundColor: colors.surface2 },
  well: {
    width: 40,
    height: 40,
    borderRadius: radii.r,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { ...text(600, 15), color: colors.text },
  subtitle: { ...text(500, 13), color: colors.text2, marginTop: 2 },
});
