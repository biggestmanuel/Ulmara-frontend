import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button, CodeBoxes, Screen, Touchable, Typography, toDigits } from '../../components/ui';
import { verifyEmail as verifyEmailApi, resendCode as resendCodeApi } from '../../lib/api/auth';
import { friendlyError } from '../../lib/api/client';
import { space, useThemeStore } from '../../lib/theme';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * Email verification.
 *
 * The code entry itself lives in `components/ui/CodeBoxes`, which is shared with
 * `verify-phone` — the two screens had drifted into different behaviour and
 * different accessibility properties.
 *
 * ## What the backend does now
 *
 * `verify-email` answers `400 "Invalid or expired verification code"` for a wrong
 * code, which `friendlyError` passes through verbatim. `resend-code` requires the
 * session token and answers `503` when the email provider has no credentials
 * configured, which maps to the per-status copy rather than a raw status line —
 * so a provider outage reads as "something went wrong on our side, try again",
 * not as a leaked `503`.
 */
export default function VerifyEmail() {
  const colors = useThemeStore((state) => state.colors);
  const { email, userId, phone, devEmailCode, devPhoneCode } = useLocalSearchParams<{
    email?: string;
    userId?: string;
    phone?: string;
    devEmailCode?: string;
    devPhoneCode?: string;
  }>();

  const [code, setCode] = useState<string[]>(() => toDigits(devEmailCode));
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
    // A paste arrives as one value containing every digit.
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
      await verifyEmailApi({ code: otp });
      router.push({
        pathname: '/(auth)/verify-phone',
        params: { phone, userId, devPhoneCode },
      });
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
      const result = await resendCodeApi({ channel: 'email' });
      // Dev mode returns the fresh code; drop it straight into the boxes.
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
        <Typography variant="title">Verify your email</Typography>
        <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
          {'We sent a 6-digit code to\n'}
          <Typography variant="label" color={colors.textPrimary}>
            {email ?? 'your email'}
          </Typography>
        </Typography>
      </View>

      <CodeBoxes
        digits={code}
        onChangeDigit={onChangeDigit}
        onDeleteAt={onDeleteAt}
        label={`Email verification code, ${CODE_LENGTH} digits`}
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
