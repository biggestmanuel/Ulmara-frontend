import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Keypad, PIN_LENGTH, PinDots, Typography } from '../../components/ui';
import { setPin as setPinApi } from '../../lib/api/auth';
import { toApiError } from '../../lib/api/client';
import { friendlyError } from '../../lib/api/client';
import { getSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { useAuthGateStore } from '../../stores/authGateStore';
import { space, useThemeStore } from '../../lib/theme';

/**
 * PIN creation and confirmation.
 *
 * Shares the `Keypad` with `verify-pin`, which is what fixed a real
 * accessibility gap: this screen's keys previously had **no
 * `accessibilityRole` and no `accessibilityLabel` at all**, so the screen used to
 * *create* the PIN that authorises every transfer was unusable with a screen
 * reader. One component now guarantees both screens name every key.
 */
export default function CreatePin() {
  const colors = useThemeStore((state) => state.colors);
  const [stage, setStage] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activePin = stage === 'create' ? pin : confirmPin;

  const persistPin = useCallback(
    async (rawPin: string) => {
      setSaving(true);
      try {
        // Hashed and stored on the server (User.pinHash) — this is the PIN
        // you'll be asked for on every future login, on any device.
        await setPinApi(rawPin);
        // They just typed and confirmed it — that's proof enough for this
        // session, so mark it verified now rather than forcing an immediate
        // re-prompt at the end of onboarding. markPinVerified (rather than
        // setState) also clears the gate's `pinMissing` flag, which is what let
        // this screen be reached at all, and re-runs the gate check so the root
        // layout resolves to 'authed'.
        await useAuthGateStore.getState().markPinVerified();
        // Normal onboarding reaches this screen from verify-phone and still owes
        // the user an Account ID, so it goes on to create-account-id. But this
        // screen is also the recovery path for an account that has an ID and no
        // PIN (verify-pin routes 409 -> here); sending that user back through
        // create-account-id would make them re-confirm an ID they already have.
        // The stored ID is the local, reliable signal for which case this is.
        const existingAccountId = await getSecureItem(SecureStorageKeys.ACCOUNT_ID);
        router.replace(existingAccountId ? '/(tabs)/home' : '/(auth)/create-account-id');
      } catch (err) {
        // `set-pin` is first-time only and answers 409 "A PIN is already set for
        // this account" once one exists. This screen is still reachable in that
        // state - most obviously on a second device, where the account was set up
        // on one device and the same onboarding path runs on the other.
        //
        // Without this branch the user is stranded: the error is shown, the
        // keypad re-arms, and every further attempt is another guaranteed 409,
        // on a screen with no route to Settings > Security where `change-pin`
        // lives. So a 409 means "your PIN already exists", not "try again" -
        // send them to the screen that can actually replace it.
        if (toApiError(err).status === 409) {
          useAuthGateStore.getState().resetPinVerified();
          router.replace('/(auth)/verify-pin');
          return;
        }
        console.error('Failed to persist PIN:', err);
        setError(friendlyError(err, 'Something went wrong saving your PIN. Try again.'));
        setConfirmPin('');
        setStage('create');
        setPin('');
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (saving) return;
      setError(null);

      const current = stage === 'create' ? pin : confirmPin;
      if (current.length >= PIN_LENGTH) return;
      const next = current + digit;

      if (stage === 'create') {
        setPin(next);
        if (next.length === PIN_LENGTH) {
          setTimeout(() => setStage('confirm'), 150);
        }
        return;
      }

      setConfirmPin(next);
      if (next.length !== PIN_LENGTH) return;

      if (next === pin) {
        void persistPin(next);
      } else {
        setError('Those PINs did not match. Start again.');
        setTimeout(() => setConfirmPin(''), 600);
      }
    },
    // `confirmPin` is a real dependency, not a lint formality. Without it this
    // callback is not recreated while the user types the *confirmation* digits
    // (nothing else in the list changes), so `current` would keep reading the
    // value from when the stage last flipped — and every digit after the first
    // would replace the buffer instead of appending to it.
    [saving, stage, pin, confirmPin, persistPin]
  );

  const handleDelete = useCallback(() => {
    if (saving) return;
    setError(null);
    if (stage === 'create') setPin((p) => p.slice(0, -1));
    else setConfirmPin((p) => p.slice(0, -1));
  }, [saving, stage]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <View style={styles.headings}>
          <Typography variant="title">
            {stage === 'create' ? 'Create your PIN' : 'Confirm your PIN'}
          </Typography>
          <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
            {stage === 'create'
              ? 'Used to authorise transfers on this account'
              : 'Enter the same PIN again'}
          </Typography>
        </View>

        <PinDots length={activePin.length} />

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
      </View>

      <View style={styles.footer}>
        <Keypad onDigit={handleDigit} onDelete={handleDelete} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: space.xxxl, alignItems: 'center' },
  headings: { alignItems: 'center', marginBottom: space.xxl },
  subtitle: { marginTop: space.sm, textAlign: 'center' },
  error: { marginTop: space.xl, textAlign: 'center' },
  footer: { paddingBottom: space.xxl },
});
