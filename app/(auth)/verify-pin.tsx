import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Keypad, PIN_LENGTH, PinDots, Touchable, Typography } from '../../components/ui';
import { verifyPin as verifyPinApi } from '../../lib/api/auth';
import { friendlyError, toApiError, clearCachedSessionToken } from '../../lib/api/client';
import { useAuthGateStore } from '../../stores/authGateStore';
import { deleteSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { space, useThemeStore } from '../../lib/theme';
import {
  authenticateWithBiometrics,
  describeOutcome,
  getBiometricCapability,
  reconcileBiometricPreference,
  setBiometricEnabled as persistBiometricPreference,
} from '../../lib/security/biometrics';

/**
 * PIN entry.
 *
 * Shown right after password login on ANY device. The PIN itself lives
 * server-side (User.pinHash) — same model as OPay/PalmPay/Moniepoint — so there
 * is no separate "set up this device" step. Enter the PIN you already created,
 * it is checked against the server, done.
 *
 * When the user has opted into biometric unlock, Face ID / fingerprint becomes
 * the primary way past this screen and the keypad is the fallback. That
 * preference is a *device-local* unlock shortcut: the PIN is still the only
 * credential the server accepts, it is still checked server-side on every
 * transfer, and nothing biometric is ever stored or sent. A biometric unlock
 * marks the in-memory `pinVerified` flag for this launch — which is exactly what
 * entering the PIN does — and nothing more.
 */
export default function VerifyPin() {
  const colors = useThemeStore((state) => state.colors);
  const [pin, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [resetting, setResetting] = useState(false);
  const markPinVerified = useAuthGateStore((s) => s.markPinVerified);
  const markPinMissing = useAuthGateStore((s) => s.markPinMissing);
  const resetPinVerified = useAuthGateStore((s) => s.resetPinVerified);
  const checkAuthGate = useAuthGateStore((s) => s.check);

  // DEV ONLY: the button below is only rendered when __DEV__, so release builds
  // never include it. Wipes every locally-persisted auth/wallet key so the next
  // launch is a true fresh install (guest state), instead of manually deleting
  // SecureStore keys by hand.
  const handleDevReset = async () => {
    setResetting(true);
    try {
      await Promise.all(Object.values(SecureStorageKeys).map((key) => deleteSecureItem(key)));
      clearCachedSessionToken();
      resetPinVerified();
      await checkAuthGate();
      router.replace('/(auth)/welcome');
    } finally {
      setResetting(false);
    }
  };

  // Reconcile the stored preference against the device's *current* enrollment
  // on every mount. This is what catches "the user added/removed a face or
  // fingerprint" and silently turns the shortcut off instead of leaving a
  // button on screen that can never succeed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [reconcile, capability] = await Promise.all([
        reconcileBiometricPreference(),
        getBiometricCapability(),
      ]);
      if (cancelled) return;
      setBiometricsAvailable(reconcile.enabled && capability.canUse);
      setBiometricLabel(capability.label);
      if (reconcile.autoDisabled && reconcile.reason) {
        setNotice(reconcile.reason);
      } else if (reconcile.enabled && !capability.canUse) {
        setNotice(capability.blockedReason);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeUnlock = useCallback(async () => {
    // Flips the in-memory pinVerified flag and re-runs the gate check, which —
    // with session + accountId already present — now resolves to 'authed'.
    // userStore/walletStore hydrate off that transition in _layout.
    await markPinVerified();
    router.replace('/(tabs)/home');
  }, [markPinVerified]);

  // Memoised so `handleDigit` can list it as a dependency without being
  // recreated on every render — the keypad is pressed repeatedly and each
  // rebuild would allocate a new callback for every key.
  const submitPin = useCallback(async (fullPin: string) => {
    setChecking(true);
    setError(null);
    setNotice(null);
    try {
      await verifyPinApi(fullPin);
      await completeUnlock();
    } catch (err) {
      // A reachable state, not a wrong guess: the backend answers 409
      // "No PIN set for this account" when User.pinHash is null. That happens
      // for anyone whose onboarding stopped between Account ID creation and PIN
      // creation. There is no PIN to guess, so the keypad can never succeed and
      // this screen is a dead end unless we move them on.
      if (toApiError(err).status === 409) {
        markPinMissing();
        router.replace('/(auth)/create-pin');
        return;
      }
      // 401/423 messages come from the shared lockout service and are already
      // non-revealing prose; friendlyError guarantees we never render a raw
      // status code if the shape is ever unexpected.
      setError(friendlyError(err, 'Something went wrong. Try again.'));
      setPinInput('');
    } finally {
      setChecking(false);
    }
  }, [completeUnlock, markPinMissing]);

  const handleBiometricUnlock = async () => {
    if (biometricBusy || checking) return;
    setBiometricBusy(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await authenticateWithBiometrics({
        promptTitle: 'Unlock Ulmara',
        promptSubtitle: `Use ${biometricLabel} to open your wallet`,
        fallbackLabel: 'Use PIN',
      });
      if (outcome === 'success') {
        await completeUnlock();
        return;
      }
      if (outcome === 'cancelled' || outcome === 'fallback') return;

      if (outcome === 'not_enrolled' || outcome === 'unavailable') {
        // The device changed under us: turn the shortcut off so the keypad is
        // the only path left, and tell the user why.
        await persistBiometricPreference(false);
        setBiometricsAvailable(false);
      }
      setError(describeOutcome(outcome) ?? 'Biometric unlock did not complete. Enter your PIN.');
    } finally {
      setBiometricBusy(false);
    }
  };

  const handleDigit = useCallback(
    (digit: string) => {
      if (checking) return;
      setError(null);
      setPinInput((current) => {
        if (current.length >= PIN_LENGTH) return current;
        const next = current + digit;
        if (next.length === PIN_LENGTH) void submitPin(next);
        return next;
      });
    },
    [checking, submitPin]
  );

  const handleDelete = useCallback(() => {
    if (checking) return;
    setError(null);
    setPinInput((current) => current.slice(0, -1));
  }, [checking]);

  const busy = checking || biometricBusy;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <View style={styles.headings}>
          <Typography variant="title">Enter your PIN</Typography>
          <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
            Enter the PIN you created for your account
          </Typography>
        </View>

        {biometricsAvailable ? (
          <Touchable
            style={[styles.biometricButton, { borderColor: colors.primary }]}
            onPress={handleBiometricUnlock}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Unlock with ${biometricLabel}`}
            accessibilityHint="Unlocks your wallet without typing your PIN"
            accessibilityState={{ disabled: busy, busy: biometricBusy }}
          >
            <Ionicons
              name={biometricLabel === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
              size={20}
              color={colors.primary}
            />
            <Typography variant="titleSm" color={colors.primary}>
              Unlock with {biometricLabel}
            </Typography>
          </Touchable>
        ) : null}

        <PinDots length={pin.length} />

        {error ? (
          <Typography variant="label" color={colors.error} style={styles.message} accessibilityLiveRegion="polite" accessibilityRole="alert">
            {error}
          </Typography>
        ) : notice ? (
          <Typography variant="caption" color={colors.textMuted} style={styles.message}>
            {notice}
          </Typography>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Keypad onDigit={handleDigit} onDelete={handleDelete} disabled={busy} />

        {__DEV__ ? (
          <Button
            label="Reset local data (dev)"
            variant="ghost"
            size="sm"
            onPress={handleDevReset}
            disabled={resetting}
            accessibilityLabel="Reset local data for development"
            accessibilityHint="Wipes this device's session, account ID and wallet keys"
            style={styles.devReset}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: space.xxxl, alignItems: 'center' },
  headings: { alignItems: 'center', marginBottom: space.xxl },
  subtitle: { marginTop: space.sm, textAlign: 'center' },

  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: space.xxl,
    minWidth: 240,
  },

  message: { marginTop: space.xl, textAlign: 'center' },

  footer: { paddingBottom: space.xxl },
  devReset: { marginTop: space.md, alignSelf: 'center' },
});
