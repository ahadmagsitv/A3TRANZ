import React, { forwardRef, memo, useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';
import { AlertCircle, Eye, type LucideIcon } from 'lucide-react-native';
import { colors, iconSize, radii } from '../theme/tokens';
import { text } from '../theme/typography';

/**
 * `.field` — label + `.inwrap` + `.input` (+ `.hasic` / `.haseye`) + `.err`.
 *
 * Used by M2 (×2), M3 (×1), M16 (×3) and M20's seal number (×1), so it is a
 * shared primitive rather than four inline copies.
 *
 * `.input` uses `border-radius: var(--rp)` — it really is a pill. The
 * "rounded rect, not a pill" comment in the gallery CSS belongs to the rule
 * beneath it (`.textarea`, `--r2`), not to this one.
 */
export interface FieldProps
  extends Omit<TextInputProps, 'style' | 'secureTextEntry' | 'editable'> {
  label: string;
  /** `.hasic` — the leading glyph, 18px at left:14. */
  icon?: LucideIcon;
  /** `.haseye` — masks the value and renders the reveal toggle. */
  secure?: boolean;
  /** `.err` beneath, plus `border-color: var(--st-overdue)` on the input. */
  error?: string | null;
  disabled?: boolean;
}

export const Field = memo(
  forwardRef<TextInputInstance, FieldProps>(function Field(
    { label, icon: Icon, secure = false, error, disabled = false, ...input },
    ref,
  ) {
    const [revealed, setRevealed] = useState(false);
    const toggle = useCallback(() => setRevealed(v => !v), []);

    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inwrap}>
          {Icon ? (
            <Icon
              size={iconSize.input}
              color={colors.placeholder}
              strokeWidth={2}
              style={styles.leadIcon}
            />
          ) : null}
          <TextInput
            ref={ref}
            editable={!disabled}
            secureTextEntry={secure && !revealed}
            placeholderTextColor={colors.placeholder}
            accessibilityLabel={label}
            textAlignVertical={input.multiline ? 'top' : 'auto'}
            style={[
              styles.input,
              Icon ? styles.hasIcon : null,
              secure ? styles.hasEye : null,
              // `.textarea` — same fill and border, but `--r2` and 96px tall.
              // It is the ONE input in the design that is not a pill.
              input.multiline ? styles.textarea : null,
              error ? styles.inputError : null,
            ]}
            {...input}
          />
          {secure ? (
            // The 63-glyph set (§1.4) has `eye` but no `eye-off`, so the
            // revealed state is carried by ink, not by a second icon.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                revealed ? 'Hide password' : 'Show password'
              }
              accessibilityState={{ selected: revealed, disabled }}
              disabled={disabled}
              onPress={toggle}
              style={[styles.eyeHit, disabled ? styles.eyeDisabled : null]}
            >
              <Eye
                size={iconSize.input}
                color={revealed ? colors.navy : colors.text2}
                strokeWidth={2}
              />
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <View style={styles.err}>
            <AlertCircle
              size={iconSize.err}
              color={colors.stOverdueInk}
              strokeWidth={2.2}
            />
            <Text style={styles.errText}>{error}</Text>
          </View>
        ) : null}
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { ...text(600, 13), color: colors.text2, marginBottom: 7 },
  inwrap: { position: 'relative', justifyContent: 'center' },
  leadIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: {
    ...text(500, 15),
    minHeight: 46, // 13 + 18 line-box + 13 + 2 border
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    color: colors.text,
    paddingVertical: 13,
    paddingHorizontal: 16,
    includeFontPadding: false,
    shadowColor: colors.navyDeep,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    elevation: 1,
  },
  textarea: { minHeight: 96, borderRadius: radii.r2 },
  hasIcon: { paddingLeft: 44 },
  hasEye: { paddingRight: 44 },
  inputError: { borderColor: colors.stOverdue },
  /**
   * The glyph stays at right:14 per the CSS; the 44×44 hit area is centred on
   * it so the tap target clears the accessibility minimum without moving a
   * pixel. (44 - 18) / 2 = 13, so right: 14 - 13 = 1.
   */
  eyeHit: {
    position: 'absolute',
    right: 1,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  eyeDisabled: { opacity: 0.5 },
  err: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  errText: { ...text(600, 12), color: colors.stOverdueInk, flex: 1 },
});
