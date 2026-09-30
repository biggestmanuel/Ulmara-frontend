import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Input, PasswordField, Screen, Typography } from '../../components/ui';
import { signup as signupApi } from '../../lib/api/auth';
import { friendlyError, setCachedSessionToken } from '../../lib/api/client';
import { setSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { space, useThemeStore } from '../../lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signup.
 *
 * ## What changed
 *
 * The old screen hand-rolled a `KeyboardAvoidingView` + `ScrollView` + four raw
 * `TextInput`s, with a single page-level error string set from whichever
 * validation failed — so the message appeared *above the form* with no
 * indication of which field was wrong, and a server error looked identical to a
 * local one. The redesign uses the shared `Input`, which owns its own error
 * slot, so **each field reports its own problem in place**, and a form-level
 * error is reserved for failures that genuinely belong to the whole submission
 * (a duplicate account, a server error).
 */
export default function Signup() {
  const colors = useThemeStore((state) => state.colors);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (fullName.trim().length < 2) errors.fullName = 'Enter your full name';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    if (phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number';
    if (password.length < 8) errors.password = 'At least 8 characters';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Matches the backend's signup phone regex: optional +, 10-15 digits.
  const normalizePhone = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    return raw.trim().startsWith('+') ? `+${digits}` : digits;
  };

  const handleSignup = async () => {
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const { user, token, devVerificationCodes } = await signupApi({
        email: email.trim().toLowerCase(),
        phone: normalizePhone(phone),
        password,
      });
      await setSecureItem(SecureStorageKeys.SESSION_TOKEN, token);
      setCachedSessionToken(token);
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
      // friendlyError guarantees readable copy: the backend's 409 "An account
      // with this email already exists…" wins, and anything that is not
      // user-facing prose (a bare 500, a proxy status line) falls back to
      // per-status wording instead of leaking transport detail.
      setFormError(friendlyError(err, 'We could not create your account. Please try again.'));
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
          <Typography variant="title">Create your account</Typography>
          <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
            Takes less than a minute
          </Typography>
        </View>

        <View style={styles.form}>
          <Input
            label="Full name"
            placeholder="Ada Lovelace"
            value={fullName}
            onChangeText={setFullName}
            error={fieldErrors.fullName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <Input
            label="Phone number"
            placeholder="+234 800 000 0000"
            value={phone}
            onChangeText={setPhone}
            error={fieldErrors.phone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="next"
          />
          <PasswordField
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            returnKeyType="go"
            onSubmitEditing={handleSignup}
          />
        </View>

        {formError ? (
          <Typography
            variant="label"
            color={colors.error}
            style={styles.formError}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {formError}
          </Typography>
        ) : null}

        <View style={styles.footer}>
          <Button label="Continue" onPress={handleSignup} loading={loading} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.replace('/(auth)/login')}
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

  formError: { marginTop: space.lg },

  footer: { marginTop: 'auto', paddingTop: space.xxl, gap: space.sm },
});
