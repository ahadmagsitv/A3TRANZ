import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { chrome, colors, iconSize, radii } from '../theme/tokens';
import { display } from '../theme/typography';

/**
 * `.topbar` — fixed chrome above `.scrl` (§6.4).
 *
 * The gallery writes `padding: 50px 18px 12px`, where the 50px absorbs its
 * 54px `.sbar` overlay — a net gap of zero below the status bar. On a device
 * that reservation is the real top inset, so the residual is what is added
 * here, never a hardcoded 50. `.topbar.lg` is `56px 18px 10px` (residual 2)
 * with a 30px title and no bottom border.
 */
export const Topbar = memo(function Topbar({
  title,
  onBack,
  large = false,
  right,
}: {
  title: string;
  /** Omit on a tab root; every pushed screen gets the `chevron-left`. */
  onBack?: () => void;
  large?: boolean;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        large ? styles.barLg : null,
        { paddingTop: insets.top + (large ? 2 : 0) },
      ]}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconbtn,
            pressed ? styles.pressed : null,
          ]}
        >
          <ChevronLeft
            size={iconSize.iconBtn}
            color={colors.text}
            strokeWidth={2.2}
          />
        </Pressable>
      ) : null}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={[styles.title, large ? styles.titleLg : null]}
      >
        {title}
      </Text>
      {right}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: chrome.topbarPadding.horizontal,
    paddingBottom: chrome.topbarPadding.bottom,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  barLg: {
    alignItems: 'flex-end',
    paddingBottom: chrome.topbarLgPadding.bottom,
    borderBottomWidth: 0,
  },
  iconbtn: {
    width: chrome.iconButton,
    height: chrome.iconButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexShrink: 0,
  },
  pressed: { opacity: 0.7 },
  title: { ...display(800, 20, -0.3), color: colors.text, flex: 1 },
  titleLg: { ...display(800, 30, -0.8) },
});
