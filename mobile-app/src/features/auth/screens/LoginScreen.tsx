import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Mail } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandMark, Button, Field, Toast } from '../../../components';
import { AuthError, type AuthErrorCode } from '../../../data/contracts';
import { authRepo } from '../../../data/repos';
import { colors } from '../../../theme/tokens';
import { display, text } from '../../../theme/typography';
import type {
  AuthStackParamList,
  RootStackParamList,
} from '../../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * The `.toast-warn` headline per failure code. The mock decides WHICH code is
 * thrown (§2.3) — this map only decides how each one reads. `M2-error` renders
 * the toast and the field `.err` together, which is exactly what a short wrong
 * password produces: the credentials are wrong AND the reason is nameable.
 */
const TOAST_COPY: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Incorrect email or password.',
  password_too_short: 'Incorrect email or password.',
  unknown_email: 'We could not find an account with that email.',
  network: 'No connection. Check your signal and try again.',
};

/**
 * `M2-default` · `M2-error` · `M2-signing-in`.
 *
 * One screen, three states, all three driven by the mock: a wrong password
 * throws a real `AuthError` and that is the only way the error state renders.
 */
export const LoginScreen = ({ navigation }: Props): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInputInstance>(null);

  // The frame ships the driver's address in the field; the mock's fixture is
  // the same account, so the demo is one tap from signing in.
  const [email, setEmail] = useState('john.reyes@a3transport.com');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    field: 'email' | 'password';
    message: string;
  } | null>(null);

  // The keyboard's "Go" key can fire onSubmitEditing in the same tick as the
  // last onChangeText keystroke, before that setState has re-rendered and
  // rebuilt `submit`'s closure — so `submit` would read a one-keystroke-stale
  // password and throw `password_too_short` on a perfectly valid one. Refs
  // update synchronously with the keystroke, closures don't; read the ref.
  const emailLive = useRef(email);
  const passwordLive = useRef(password);
  const updateEmail = useCallback((v: string) => {
    emailLive.current = v;
    setEmail(v);
  }, []);
  const updatePassword = useCallback((v: string) => {
    passwordLive.current = v;
    setPassword(v);
  }, []);

  const submit = useCallback(async () => {
    if (signingIn) {
      return;
    }
    setSigningIn(true);
    setToast(null);
    setFieldError(null);
    try {
      await authRepo.signIn(emailLive.current, passwordLive.current);
      navigation
        .getParent<NativeStackScreenProps<RootStackParamList>['navigation']>()
        ?.reset({ index: 0, routes: [{ name: 'App' }] });
    } catch (e) {
      if (e instanceof AuthError) {
        setToast(TOAST_COPY[e.code]);
        setFieldError(e.field ? { field: e.field, message: e.message } : null);
      } else {
        setToast('Something went wrong. Try again.');
      }
      setSigningIn(false);
    }
  }, [signingIn, navigation]);

  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);
  const goReset = useCallback(
    () => navigation.navigate('ResetPassword'),
    [navigation],
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrl,
          // `.scrl { padding: 78px 24px 24px }` — 78 measured from the frame
          // top, of which the first 54 are the status bar overlay.
          { paddingTop: insets.top + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <BrandMark variant="mark" />

        <Text style={styles.heading}>Welcome back</Text>
        <Text style={[styles.sub, toast ? styles.subTight : null]}>
          Sign in to view your assigned jobs.
        </Text>

        {toast ? (
          <Toast tone="warn" message={toast} style={styles.toast} />
        ) : null}

        <Field
          label="Email"
          icon={Mail}
          value={email}
          onChangeText={updateEmail}
          error={fieldError?.field === 'email' ? fieldError.message : null}
          disabled={signingIn}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={focusPassword}
        />

        <Field
          ref={passwordRef}
          label="Password"
          icon={Lock}
          secure
          value={password}
          onChangeText={updatePassword}
          error={fieldError?.field === 'password' ? fieldError.message : null}
          disabled={signingIn}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <View style={styles.forgotRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Forgot password?"
            accessibilityState={{ disabled: signingIn }}
            disabled={signingIn}
            onPress={goReset}
            hitSlop={{ top: 14, bottom: 14, left: 20, right: 8 }}
          >
            <Text style={[styles.forgot, signingIn ? styles.dim : null]}>
              Forgot password?
            </Text>
          </Pressable>
        </View>

        <Button
          label={signingIn ? 'Signing in…' : 'Sign in'}
          onPress={submit}
          loading={signingIn}
          block
          style={signingIn ? styles.btnBusy : null}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scrl: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },
  heading: {
    ...display(800, 22, -0.4),
    color: colors.text,
    marginTop: 22, // the mark's `margin-bottom:22px`
  },
  sub: { ...text(500, 14), color: colors.text2, marginBottom: 26 },
  subTight: { marginBottom: 18 },
  toast: { marginBottom: 18 },
  forgotRow: { alignItems: 'flex-end', marginTop: -4, marginBottom: 22 },
  forgot: { ...text(600, 13), color: colors.navy },
  dim: { opacity: 0.5 },
  // `.btn-primary` at 45% is the LOCKED affordance (§6.1) and must never be
  // reused for "busy" — signing in stays at .9, exactly as the frame draws it.
  btnBusy: { opacity: 0.9 },
});
