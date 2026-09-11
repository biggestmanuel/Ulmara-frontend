import { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { verifyEmail as verifyEmailApi } from '../../lib/api/auth';
import type { ApiErrorShape } from '../../lib/api/client';
import { useThemeStore, ThemeColors } from '../../lib/theme';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function VerifyEmail() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const { email, userId, phone } = useLocalSearchParams<{ email?: string; userId?: string; phone?: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (seconds === 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const onChangeDigit = (val: string, idx: number) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < CODE_LENGTH - 1) inputs.current[idx + 1]?.focus();
  };

  const onKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !code[idx] && idx > 0) inputs.current[idx - 1]?.focus();
  };

  const handleVerify = async () => {
    setError(null);
    const otp = code.join('');
    if (otp.length !== CODE_LENGTH) return setError('Enter the 6-digit code');

    if (!userId) {
      setError('Missing signup session. Please sign up again.');
      return;
    }

    setLoading(true);
    try {
      await verifyEmailApi({ userId, code: otp });
      router.push({
        pathname: '/(auth)/verify-phone',
        params: { phone, userId },
      });
    } catch (err) {
      setError((err as ApiErrorShape).message ?? 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (seconds > 0) return;
    setSeconds(RESEND_SECONDS);
    // TODO: trigger resend email API call
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.emailText}>{email ?? 'your email'}</Text>
        </Text>

        <View style={styles.codeRow}>
          {code.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={(r) => {
                inputs.current[idx] = r;
              }}
              style={styles.codeBox}
              value={digit}
              onChangeText={(v) => onChangeDigit(v, idx)}
              onKeyPress={({ nativeEvent }) => onKeyPress(nativeEvent.key, idx)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
            />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={handleResend} disabled={seconds > 0}>
          <Text style={[styles.resend, seconds > 0 && styles.resendDisabled]}>
            {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 8, marginBottom: 32, lineHeight: 21 },
  emailText: { color: colors.textPrimary, fontWeight: '600' },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  codeBox: {
    width: 48, height: 56, borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, fontSize: 22, fontWeight: '600',
  },
  error: { color: colors.error, fontSize: 13, marginTop: 4 },
  resend: { color: colors.primaryHover, fontSize: 14, fontWeight: '600', marginTop: 24 },
  resendDisabled: { color: colors.textMuted },
  footer: { paddingHorizontal: 24, paddingBottom: 32 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', height: 54,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
}
