import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { login as loginApi } from '../../lib/api/auth';
import { getMe } from '../../lib/api/accountId';
import type { ApiErrorShape } from '../../lib/api/client';
import { getSecureItem, setSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { useAuthGateStore } from '../../stores/authGateStore';
import { useThemeStore, ThemeColors } from '../../lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address');
    if (password.length < 8) return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      const { token } = await loginApi({ email, password });
      await setSecureItem(SecureStorageKeys.SESSION_TOKEN, token);

      // Deliberately do NOT check the auth gate here. The gate only tracks
      // session + account id — PIN is checked server-side on the next screen,
      // not by the gate — so flipping it to 'authed' before that would let
      // _layout route straight to home and skip PIN entry entirely.
      let accountId = await getSecureItem(SecureStorageKeys.ACCOUNT_ID);
      if (!accountId) {
        // Fresh device, existing account: fetch and cache it so PIN entry
        // (and everything after) has what it needs. No local prompt needed —
        // an account is created once at signup, not per device.
        const me = await getMe();
        accountId = me?.accountId?.accountId ?? null;
        if (accountId) await setSecureItem(SecureStorageKeys.ACCOUNT_ID, accountId);
      }

      if (!accountId) {
        setError('No Account ID found for this account. Please complete signup.');
        return;
      }

      // session + accountId now present, pinVerified still false this
      // launch -> gate flips to 'locked', which _layout also routes to
      // verify-pin, but we navigate directly rather than wait on the effect.
      await useAuthGateStore.getState().check();
      router.replace('/(auth)/verify-pin');
    } catch (err) {
      setError((err as ApiErrorShape).message ?? 'Login failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.body}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to your account</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Log In</Text>}
          </Pressable>
          <Pressable onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.secondaryText}>
              Don't have an account? <Text style={styles.linkInline}>Sign up</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 40 },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 32 },
  field: { marginBottom: 18 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: '500' },
  input: {
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: colors.border,
  },
  error: { color: colors.error, fontSize: 13, marginTop: 4, marginBottom: 8 },
  link: { color: colors.primaryHover, fontSize: 14, fontWeight: '500', marginTop: 4 },
  linkInline: { color: colors.primaryHover, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 16 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', height: 54,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
}
