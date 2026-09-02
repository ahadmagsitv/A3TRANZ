import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Loader2, Lock, type LucideIcon } from 'lucide-react-native';
import { chrome, colors, iconSize, radii } from '../theme/tokens';
import { text } from '../theme/typography';
import {
  shadowButton,
  shadowButtonAmber,
  shadowButtonDanger,
  shadowButtonPrimary,
} from '../theme/shadows';

/** `.btn` variants — -primary/-amber/-secondary/-ghost/-danger. */
export type ButtonVariant =
  | 'primary'
  | 'amber'
  | 'secondary'
  | 'ghost'
  | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** `.btn-block` — full width. */
  block?: boolean;
  icon?: LucideIcon;
  /**
   * The step gate. A locked button stays VISIBLE at 45% with a lock glyph and
   * never disappears (§6.1). Pass `lockCopy` for the "n of m" line beneath it.
   */
  locked?: boolean;
  lockCopy?: string | null;
  /** M2-signing-in — spinner inside the button, label swapped by the caller. */
  loading?: boolean;
  /**
   * Overrides the variant's label + glyph ink. Exactly one frame needs it:
   * M15's Log out is a `.btn-secondary` inked `--st-overdue-ink`. Fill and
   * border still come from the variant.
   */
  ink?: string;
  style?: StyleProp<ViewStyle>;
}

const FILL: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.navy, ...shadowButtonPrimary },
  amber: { backgroundColor: colors.amber, ...shadowButtonAmber },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.stOverdue, ...shadowButtonDanger },
};

const INK: Record<ButtonVariant, string> = {
  primary: colors.onNavy,
  amber: colors.onAmber,
  secondary: colors.text,
  ghost: colors.navy,
  danger: colors.onNavy,
};

/**
 * `<i data-lucide="loader-2" class="spin">` — the design's own spinner glyph
 * rotated by the `spin` keyframe. Not `ActivityIndicator`: that is a platform
 * widget with its own shape and its own rotation, so it would neither match
 * the frame nor sit still inside this one.
 */
const Spinner = memo(function Spinner({ tint }: { tint: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return (
    <Animated.View
      style={{
        transform: [
          {
            rotate: spin.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            }),
          },
        ],
      }}
    >
      <Loader2 size={iconSize.button} color={tint} strokeWidth={2.4} />
    </Animated.View>
  );
});

export const Button = memo(function Button({
  label,
  onPress,
  variant = 'primary',
  block,
  icon: Icon,
  locked = false,
  lockCopy,
  loading = false,
  ink: inkOverride,
  style,
}: ButtonProps) {
  const disabled = locked || loading;
  const Glyph = locked ? Lock : Icon;
  const ink = inkOverride ?? INK[variant];

  return (
    <View style={block ? styles.blockWrap : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityHint={locked && lockCopy ? lockCopy : undefined}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          variant === 'ghost' ? null : shadowButton,
          FILL[variant],
          block ? styles.block : null,
          locked ? styles.locked : null,
          pressed && !disabled ? styles.pressed : null,
          style,
        ]}
      >
        {loading ? <Spinner tint={ink} /> : null}
        {!loading && Glyph ? (
          <Glyph size={iconSize.button} color={ink} strokeWidth={2} />
        ) : null}
        <Text numberOfLines={1} style={[styles.label, { color: ink }]}>
          {label}
        </Text>
      </Pressable>
      {lockCopy ? <Text style={styles.lockCopy}>{lockCopy}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    height: chrome.buttonHeight,
    paddingHorizontal: 24,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  block: { alignSelf: 'stretch' },
  blockWrap: { alignSelf: 'stretch' },
  locked: { opacity: chrome.lockedOpacity },
  pressed: { opacity: 0.86 },
  label: { ...text(600, 17, -0.2) },
  lockCopy: {
    ...text(500, 12),
    color: colors.text2,
    textAlign: 'center',
    marginTop: 9,
  },
});
