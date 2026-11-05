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

const TOAST_COPY: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Incorrect email or password.',
  password_too_short: 'Incorrect email or password.',
  unknown_email: 'We could not find an account with that email.',
  not_a_driver: 'This app is for drivers. Office accounts use the admin site.',
  network: 'No connection. Check your signal and try again.',
};

export const LoginScreen = ({ navigation }: Props): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInputInstance>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

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
    setToast(null);
    const missing = {
      email: emailLive.current.trim() ? undefined : 'Email address is required',
      password: passwordLive.current ? undefined : 'Password is required',
    };
    setFieldErrors(missing);
    if (missing.email || missing.password) {
      return;
    }
    setSigningIn(true);
    try {
      await authRepo.signIn(emailLive.current, passwordLive.current);
      navigation
        .getParent<NativeStackScreenProps<RootStackParamList>['navigation']>()
        ?.reset({ index: 0, routes: [{ name: 'App' }] });
    } catch (e) {
      if (e instanceof AuthError) {
        setToast(TOAST_COPY[e.code]);
        setFieldErrors(e.field ? { [e.field]: e.message } : {});
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
          placeholder="Enter your email address"
          error={fieldErrors.email}
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
          placeholder="Enter your password"
          error={fieldErrors.password}
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
    marginTop: 22,
  },
  sub: { ...text(500, 14), color: colors.text2, marginBottom: 26 },
  subTight: { marginBottom: 18 },
  toast: { marginBottom: 18 },
  forgotRow: { alignItems: 'flex-end', marginTop: -4, marginBottom: 22 },
  forgot: { ...text(600, 13), color: colors.navy },
  dim: { opacity: 0.5 },
  btnBusy: { opacity: 0.9 },
});
