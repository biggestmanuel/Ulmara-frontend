import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Input, PasswordField, Screen, Touchable, Typography } from '../../components/ui';
import { login as loginApi } from '../../lib/api/auth';
import { friendlyError, setCachedSessionToken } from '../../lib/api/client';
import { setSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { getSecureItem } from '../../lib/storage/secureStorage';
import { getMe } from '../../lib/api/accountId';
import { useAuthGateStore } from '../../stores/authGateStore';
import { space, useThemeStore } from '../../lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Login.
 *
 * ## What changed
 *
 * Structure is the same — email, password, forgot link, primary action — but the
 * fields now carry their own labels and their own error slot, and the "Log in"
 * button is the shared `Button` rather than a hand-rolled 54pt `Pressable` with
 * a `#FFFFFF` label and a spinner that replaced the text outright (so the button
 * changed width mid-request). It also now has `accessibilityState={{ busy }}`,
 * so a screen reader hears that the request is in flight.
 */
export default function Login() {
  const colors = useThemeStore((state) => state.colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const errors: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address';
    if (!password) errors.password = 'Enter your password';
    setFieldError(errors);
    if (Object.keys(errors).length > 0) return;

    setError(null);
    setLoading(true);
    try {
      const { token } = await loginApi({ email: email.trim(), password });
      await setSecureItem(SecureStorageKeys.SESSION_TOKEN, token);
      setCachedSessionToken(token);

      // Deliberately do NOT check the auth gate here. The gate only tracks
      // session + account id — PIN is checked server-side on the next screen, not
      // by the gate — so flipping it to 'authed' before that would let _layout
      // route straight to home and skip PIN entry entirely.
      let accountId = await getSecureItem(SecureStorageKeys.ACCOUNT_ID);
      if (!accountId) {
        // Fresh device, existing account: fetch and cache it so PIN entry (and
        // everything after) has what it needs. No local prompt needed — an
        // account is created once at signup, not per device.
        const me = await getMe();
        accountId = me?.accountId?.accountId ?? null;
        if (accountId) await setSecureItem(SecureStorageKeys.ACCOUNT_ID, accountId);
      }

      if (!accountId) {
        // A real, reachable state: the account exists and the password is
        // correct, but onboarding never got as far as minting an Account ID.
        // The session token is already stored, so send them to the screen that
        // mints the ID instead of stranding them on a message they cannot act on.
        router.replace('/(auth)/create-account-id');
        return;
      }

      // session + accountId now present, pinVerified still false this launch ->
      // gate flips to 'locked', which _layout also routes to verify-pin, but we
      // navigate directly rather than wait on the effect.
      await useAuthGateStore.getState().check();
      router.replace('/(auth)/verify-pin');
    } catch (err) {
      // friendlyError never renders a bare status code: the backend's 401
      // "Invalid email or password…" passes through, anything else falls back to
      // readable per-status copy.
      setError(friendlyError(err, 'Login failed. Check your details and try again.'));
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
        <View style={styles.headings}>
          <Typography variant="title">Welcome back</Typography>
          <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
            Log in to your account
          </Typography>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            error={fieldError.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <PasswordField
            label="Password"
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
            error={fieldError.password}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
        </View>

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

        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Forgot password"
          accessibilityHint="Opens password recovery"
          onPress={() => router.push('/(auth)/forgot-password')}
          pressScale={0.97}
          style={styles.forgot}
        >
          <Typography variant="label" color={colors.primary}>
            Forgot password?
          </Typography>
        </Touchable>

        <View style={styles.footer}>
          <Button label="Log in" onPress={handleLogin} loading={loading} />
          <Button
            label="Create an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/signup')}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headings: { marginBottom: space.xxl },
  subtitle: { marginTop: space.xs },

  form: { gap: space.lg },

  error: { marginTop: space.lg },

  forgot: { alignSelf: 'flex-start', marginTop: space.lg, paddingVertical: space.xs },

  footer: { marginTop: 'auto', paddingTop: space.xxl, gap: space.sm },
});
