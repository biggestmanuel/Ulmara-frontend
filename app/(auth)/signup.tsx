import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { signup as signupApi } from '../../lib/api/auth';
import type { ApiErrorShape } from '../../lib/api/client';
import { setSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { useThemeStore, ThemeColors } from '../../lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (fullName.trim().length < 2) return 'Enter your full name';
    if (!EMAIL_RE.test(email)) return 'Enter a valid email address';
    if (phone.replace(/\D/g, '').length < 10) return 'Enter a valid phone number';
    if (password.length < 8) return 'Password must be at least 8 characters';
    return null;
  };

  // Matches the backend's signup phone regex: optional +, 10-15 digits.
  const normalizePhone = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    return raw.trim().startsWith('+') ? `+${digits}` : digits;
  };

  const handleSignup = async () => {
    const err = validate();
    setError(err);
    if (err) return;

    setLoading(true);
    try {
      const { user, token, devVerificationCodes } = await signupApi({
        email: email.trim().toLowerCase(),
        phone: normalizePhone(phone),
        password,
      });
      await setSecureItem(SecureStorageKeys.SESSION_TOKEN, token);
      router.push({
        pathname: '/(auth)/verify-email',
        params: {
          email,
          phone,
          userId: user.id,
          devEmailCode: devVerificationCodes?.email,
          devPhoneCode: devVerificationCodes?.phone,
        },
      });
    } catch (err) {
      // apiClient's response interceptor already normalizes rejected errors
      // to a readable ApiErrorShape (409/500 included) — don't re-wrap here.
      setError((err as ApiErrorShape).message);
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
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Takes less than a minute</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              placeholder="John Doe"
              placeholderTextColor={colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

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
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              placeholder="+234 800 000 0000"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
          </Pressable>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.secondaryText}>
              Already have an account? <Text style={styles.linkInline}>Log in</Text>
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
    body: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 20 },
    title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
    subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 32 },
    field: { marginBottom: 18 },
    label: { fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: '600' },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: colors.textPrimary,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    passwordWrap: { position: 'relative', justifyContent: 'center' },
    eyeBtn: { position: 'absolute', right: 16 },
    error: { color: colors.error, fontSize: 13, marginTop: 4 },
    footer: { paddingHorizontal: 24, paddingBottom: 36, gap: 16 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    secondaryText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
    linkInline: { color: colors.primary, fontWeight: '700' },
  });
}
