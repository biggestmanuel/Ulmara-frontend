import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { BackButton } from '../../components/navigation/BackButton';
import { Button, Input, Screen, Typography } from '../../components/ui';
import { forgotPassword } from '../../lib/api/auth';
import { friendlyError } from '../../lib/api/client';
import { space, useThemeStore } from '../../lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Password recovery.
 *
 * The previous version read the error straight off the API error object
 * (`toApiError(err).message`), which is how raw status lines and bare codes
 * reached the UI before `friendlyError` existed. It now goes through
 * `friendlyError`, and validation moved onto the field itself.
 */
export default function ForgotPassword() {
  const colors = useThemeStore((state) => state.colors);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setError(null);
    setFieldError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError('Enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(friendlyError(err, 'We could not send the reset link. Try again shortly.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <Screen>
        <BackButton />

        <View style={styles.headings}>
          <Typography variant="title">
            {sent ? 'Check your email' : 'Reset your password'}
          </Typography>
          <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
            {sent
              ? 'We sent a reset link to your address. It can take a minute to arrive.'
              : "Enter the email on your account and we'll send you a reset link."}
          </Typography>
        </View>

        {!sent ? (
          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              error={fieldError ?? undefined}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={handleSend}
            />
          </View>
        ) : null}

        {error ? (
          <Typography
            variant="label"
            color={colors.error}
            style={styles.error}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {error}
          </Typography>
        ) : null}

        <View style={styles.footer}>
          {sent ? (
            <Button label="Back to login" onPress={() => router.replace('/(auth)/login')} />
          ) : (
            <Button label="Send reset link" onPress={handleSend} loading={loading} />
          )}
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headings: { marginTop: space.xxl, marginBottom: space.xxl },
  subtitle: { marginTop: space.md },
  form: { gap: space.lg },
  error: { marginTop: space.lg },
  footer: { marginTop: 'auto', paddingTop: space.xxl, gap: space.sm },
});
