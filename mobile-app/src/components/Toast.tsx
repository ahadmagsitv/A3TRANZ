import React, { memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, iconSize, radii, tint } from '../theme/tokens';
import { text } from '../theme/typography';
import { shadowMd } from '../theme/shadows';

/** `.toast` -ok / -info / -warn / -err */
export type ToastTone = 'ok' | 'info' | 'warn' | 'err';

const TONE: Record<
  ToastTone,
  { bg: string; ink: string; border: string; icon: LucideIcon }
> = {
  ok: {
    bg: colors.okBg,
    ink: colors.stDoneInk,
    border: tint.toastOkBorder,
    icon: CheckCircle2,
  },
  info: {
    bg: colors.infoBg,
    ink: colors.stProgressInk,
    border: tint.toastInfoBorder,
    icon: Info,
  },
  // Amber as a FILL only; the ink is --amber-ink, the one readable amber.
  warn: {
    bg: colors.warnBg,
    ink: colors.amberInk,
    border: tint.toastWarnBorder,
    icon: AlertTriangle,
  },
  err: {
    bg: tint.pillOverdue,
    ink: colors.stOverdueInk,
    border: tint.cardOverdue.border,
    icon: AlertCircle,
  },
};

export const Toast = memo(function Toast({
  tone,
  message,
  icon,
  style,
}: {
  tone: ToastTone;
  message: string;
  /** Override the default glyph (e.g. `clock` on the payroll hold rule). */
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONE[tone];
  const Glyph = icon ?? t.icon;
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.toast,
        { backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      <Glyph size={iconSize.toast} color={t.ink} strokeWidth={2} />
      <Text style={[styles.message, { color: t.ink }]}>{message}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radii.r,
    borderWidth: 1,
    ...shadowMd,
  },
  message: { ...text(600, 14), flex: 1 },
});
