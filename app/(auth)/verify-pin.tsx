import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { verifyPin as verifyPinApi } from '../../lib/api/auth';
import type { ApiErrorShape } from '../../lib/api/client';
import { useAuthGateStore } from '../../stores/authGateStore';
import { deleteSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { useThemeStore, ThemeColors } from '../../lib/theme';

const PIN_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// Shown right after password login on ANY device. The PIN itself lives
// server-side (User.pinHash) — same model as OPay/PalmPay/Moniepoint — so
// there's no separate "set up this device" step. Enter the PIN you already
// created, it's checked against the server, done.
export default function VerifyPin() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [pin, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const markPinVerified = useAuthGateStore((s) => s.markPinVerified);
  const resetPinVerified = useAuthGateStore((s) => s.resetPinVerified);
  const checkAuthGate = useAuthGateStore((s) => s.check);

  // DEV ONLY — remove before shipping. Wipes every locally-persisted
  // auth/wallet key so the next launch is a true fresh install (guest
  // state), instead of manually deleting SecureStore keys by hand.
  const handleDevReset = async () => {
    setResetting(true);
    try {
      await Promise.all(Object.values(SecureStorageKeys).map((key) => deleteSecureItem(key)));
      resetPinVerified();
      await checkAuthGate();
      router.replace('/(auth)/welcome');
    } finally {
      setResetting(false);
    }
  };

  const submitPin = async (fullPin: string) => {
    setChecking(true);
    try {
      await verifyPinApi(fullPin);
      // Flips the in-memory pinVerified flag and re-runs the gate check,
      // which — with session + accountId already present — now resolves to
      // 'authed'. userStore/walletStore hydrate off that transition in
      // _layout, so nothing else needs to happen here.
      await markPinVerified();
      router.replace('/(tabs)/home');
    } catch (err) {
      const apiErr = err as ApiErrorShape;
      setError(apiErr.status === 401 ? 'Incorrect PIN' : apiErr.message ?? 'Something went wrong');
      setPinInput('');
    } finally {
      setChecking(false);
    }
  };

  const handleKeyPress = (key: string) => {
    if (key === '' || checking) return;
    setError(null);

    if (key === 'del') {
      setPinInput((p) => p.slice(0, -1));
      return;
    }

    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPinInput(next);

    if (next.length === PIN_LENGTH) {
      submitPin(next);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title}>Enter your PIN</Text>
        <Text style={styles.subtitle}>Enter the PIN you created for your account</Text>

        <View style={styles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </View>

        {checking && <ActivityIndicator color={colors.primaryHover} style={{ marginTop: 20 }} />}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.keypad}>
        {KEYS.map((key, idx) => (
          <Pressable
            key={idx}
            style={styles.key}
            onPress={() => handleKeyPress(key)}
            disabled={key === '' || checking}
          >
            <Text style={styles.keyText}>{key === 'del' ? '⌫' : key}</Text>
          </Pressable>
        ))}
      </View>

      {/* DEV ONLY — remove before shipping */}
      <Pressable style={styles.devResetBtn} onPress={handleDevReset} disabled={resetting}>
        {resetting ? (
          <ActivityIndicator color={colors.error} size="small" />
        ) : (
          <Text style={styles.devResetText}>Reset local data (dev)</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 56, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 8, marginBottom: 40, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.divider },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: { color: colors.error, fontSize: 13, marginTop: 24 },
  keypad: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, paddingBottom: 40,
  },
  key: {
    width: '33.33%', height: 76, alignItems: 'center', justifyContent: 'center',
  },
  keyText: { fontSize: 26, color: colors.textPrimary, fontWeight: '500' },
  devResetBtn: { alignItems: 'center', paddingBottom: 24 },
  devResetText: { color: colors.error, fontSize: 12, textDecorationLine: 'underline' },
});
}
