import React, { useCallback, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type TextInputInstance,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Lock } from 'lucide-react-native';
import { Button, Field, Toast, Topbar } from '../../../components';
import { driversRepo } from '../../../data/repos';
import { errorMessage } from '../../../hooks/useAsync';
import { colors, spacing } from '../../../theme/tokens';
import type { AppStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'ChangePassword'>;

type FieldName = 'current' | 'next' | 'confirm';

export const ChangePasswordScreen = ({
  navigation,
}: Props): React.JSX.Element => {
  const nextRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<{
    field: FieldName;
    message: string;
  } | null>(null);

  const currentLive = useRef(current);
  const nextLive = useRef(next);
  const confirmLive = useRef(confirm);

  const updateCurrent = useCallback((v: string) => {
    currentLive.current = v;
    setCurrent(v);
  }, []);
  const updateNext = useCallback((v: string) => {
    nextLive.current = v;
    setNext(v);
  }, []);
  const updateConfirm = useCallback((v: string) => {
    confirmLive.current = v;
    setConfirm(v);
  }, []);

  const submit = useCallback(async () => {
    if (saving) {
      return;
    }
    const cur = currentLive.current;
    const nxt = nextLive.current;
    const cnf = confirmLive.current;

    setSaved(false);
    if (cur.length === 0) {
      setFieldError({
        field: 'current',
        message: 'Enter your current password.',
      });
      return;
    }
    if (nxt.trim().length < 8) {
      setFieldError({
        field: 'next',
        message: 'New password must be at least 8 characters.',
      });
      return;
    }
    if (cnf !== nxt) {
      setFieldError({ field: 'confirm', message: 'Passwords do not match.' });
      return;
    }

    setFieldError(null);
    setSaving(true);
    try {
      await driversRepo.changePassword(cur, nxt);
      Keyboard.dismiss();
      setSaved(true);
      updateCurrent('');
      updateNext('');
      updateConfirm('');
    } catch (e) {
      setFieldError({ field: 'current', message: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }, [saving, updateConfirm, updateCurrent, updateNext]);

  const focusNext = useCallback(() => nextRef.current?.focus(), []);
  const focusConfirm = useCallback(() => confirmRef.current?.focus(), []);
  const back = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={styles.screen}>
      <Topbar title="Change password" onBack={back} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrl}
          keyboardShouldPersistTaps="handled"
        >
          {saved ? (
            <Toast
              tone="ok"
              message="Password updated."
              style={styles.toast}
            />
          ) : null}

          <Field
            label="Current password"
            icon={Lock}
            secure
            value={current}
            onChangeText={updateCurrent}
            error={fieldError?.field === 'current' ? fieldError.message : null}
            disabled={saving}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={focusNext}
          />

          <Field
            ref={nextRef}
            label="New password"
            icon={Lock}
            secure
            placeholder="At least 8 characters"
            value={next}
            onChangeText={updateNext}
            error={fieldError?.field === 'next' ? fieldError.message : null}
            disabled={saving}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={focusConfirm}
          />

          <Field
            ref={confirmRef}
            label="Confirm new password"
            icon={Lock}
            secure
            placeholder="Re-enter new password"
            value={confirm}
            onChangeText={updateConfirm}
            error={fieldError?.field === 'confirm' ? fieldError.message : null}
            disabled={saving}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          <Button
            label={saving ? 'Updating…' : 'Update password'}
            onPress={submit}
            loading={saving}
            block
            style={styles.btn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrl: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenH,
    paddingVertical: spacing.screenV,
  },
  toast: { marginBottom: 16 },
  btn: { marginTop: 8 },
});
