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

export interface FieldProps
  extends Omit<TextInputProps, 'style' | 'secureTextEntry' | 'editable'> {
  label: string;
  icon?: LucideIcon;
  secure?: boolean;
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
              input.multiline ? styles.textarea : null,
              error ? styles.inputError : null,
            ]}
            {...input}
          />
          {secure ? (
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
    minHeight: 46,
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
