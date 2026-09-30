import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button, CodeBoxes, Screen, Touchable, Typography, toDigits } from '../../components/ui';
import { verifyPhone as verifyPhoneApi, resendCode as resendCodeApi } from '../../lib/api/auth';
import { friendlyError } from '../../lib/api/client';
import { space, useThemeStore } from '../../lib/theme';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * Phone verification.
 *
 * Shares `CodeBoxes` with `verify-email`. This screen's copy of the code field
 * previously had no accessible labels at all and could not accept a pasted
 * code; both are fixed by the shared component.
 */
export default function VerifyPhone() {
  const colors = useThemeStore((state) => state.colors);
  const { phone, userId, devPhoneCode } = useLocalSearchParams<{
    phone?: string;
    userId?: string;
    devPhoneCode?: string;
  }>();

  const [code, setCode] = useState<string[]>(() => toDigits(devPhoneCode));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds === 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const onChangeDigit = useCallback((value: string, index: number) => {
    const incoming = value.replace(/\D/g, '');
    setError(null);
    if (incoming.length > 1) {
      setCode(toDigits(incoming.slice(-CODE_LENGTH)));
      return;
    }
    setCode((current) => {
      const next = [...current];
      next[index] = incoming.slice(-1);
      return next;
    });
  }, []);

  const onDeleteAt = useCallback((index: number) => {
    setCode((current) => {
      const next = [...current];
      next[index] = '';
      return next;
    });
  }, []);

  const handleVerify = async () => {
    setError(null);
    const otp = code.join('');
    if (otp.length !== CODE_LENGTH) {
      setError('Enter all six digits');
      return;
    }
    if (!userId) {
      setError('Missing signup session. Please sign up again.');
      return;
    }

    setLoading(true);
    try {
      await verifyPhoneApi({ userId, code: otp });
      router.replace('/(auth)/create-pin');
    } catch (err) {
      setError(friendlyError(err, 'That code did not work. Try again.'));
      setCode(Array(CODE_LENGTH).fill(''));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (seconds > 0 || resending || !userId) return;
    setResending(true);
    setError(null);
    try {
      const result = await resendCodeApi({ userId, channel: 'phone' });
      if (result.devCode) setCode(toDigits(result.devCode));
      setSeconds(RESEND_SECONDS);
    } catch (err) {
      setError(friendlyError(err, 'We could not send another code. Try again shortly.'));
    } finally {
      setResending(false);
    }
  };

  const resendDisabled = seconds > 0 || resending;

  return (
    <Screen>
      <View style={styles.headings}>
        <Typography variant="title">Verify your phone</Typography>
        <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
          {'We sent a 6-digit code by SMS to\n'}
          <Typography variant="label" color={colors.textPrimary}>
            {phone ?? 'your number'}
          </Typography>
        </Typography>
      </View>

      <CodeBoxes
        digits={code}
        onChangeDigit={onChangeDigit}
        onDeleteAt={onDeleteAt}
        label={`SMS verification code, ${CODE_LENGTH} digits`}
        invalid={Boolean(error)}
      />

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
        <Button label="Verify" onPress={handleVerify} loading={loading} />

        <Touchable
          accessibilityRole="button"
          accessibilityLabel={seconds > 0 ? `Resend code in ${seconds} seconds` : 'Resend code'}
          accessibilityState={{ disabled: resendDisabled, busy: resending }}
          onPress={handleResend}
          disabled={resendDisabled}
          pressScale={0.97}
          style={styles.resend}
        >
          <Typography variant="label" color={resendDisabled ? colors.textMuted : colors.primary}>
            {resending ? 'Sending…' : seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
          </Typography>
        </Touchable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headings: { marginBottom: space.xxl },
  subtitle: { marginTop: space.md },
  error: { marginTop: space.lg },
  footer: { marginTop: 'auto', paddingTop: space.xxl, alignItems: 'center' },
  resend: { paddingVertical: space.md, paddingHorizontal: space.lg, marginTop: space.md },
});
