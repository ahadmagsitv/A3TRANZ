import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Mail, MailCheck } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Empty, Field, Topbar } from '../../../components';
import { AuthError } from '../../../data/contracts';
import { authRepo } from '../../../data/repos';
import { colors, spacing } from '../../../theme/tokens';
import { text } from '../../../theme/typography';
import type { AuthStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export const ResetPasswordScreen = ({
  navigation,
}: Props): React.JSX.Element => {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ sentTo: string; expiry: string } | null>(
    null,
  );

  const emailLive = useRef(email);
  const updateEmail = useCallback((v: string) => {
    emailLive.current = v;
    setEmail(v);
  }, []);

  const submit = useCallback(async () => {
    if (sending) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await authRepo.requestReset(emailLive.current);
      setSent({ sentTo: result.sentTo, expiry: result.expiryLabel });
    } catch (e) {
      setError(
        e instanceof AuthError
          ? e.message
          : 'Something went wrong. Try again.',
      );
      setSending(false);
    }
  }, [sending]);

  const back = useCallback(() => navigation.goBack(), [navigation]);

  const openMail = useCallback(() => {
    Linking.openURL(Platform.OS === 'ios' ? 'message://' : 'mailto:').catch(
      () => undefined,
    );
  }, []);

  return (
    <View style={styles.screen}>
      <Topbar title="Reset password" onBack={back} />

      {sent ? (
        <Empty
          icon={MailCheck}
          circleColor={colors.okBg}
          iconColor={colors.stDone}
          title="Check your email"
          body={`We sent a reset link to ${sent.sentTo}. ${sent.expiry}`}
          action={
            <Button label="Open email app" variant="secondary" onPress={openMail} />
          }
        />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrl}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.instr}>
              Enter the email linked to your account and we'll send a reset
              link.
            </Text>

            <Field
              label="Email"
              icon={Mail}
              placeholder="you@a3tranz.com"
              value={email}
              onChangeText={updateEmail}
              error={error}
              disabled={sending}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            <Button
              label={sending ? 'Sending…' : 'Send reset link'}
              onPress={submit}
              loading={sending}
              block
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
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
  instr: {
    ...text(500, 14),
    lineHeight: 22,
    color: colors.text2,
    marginBottom: 22,
  },
});
