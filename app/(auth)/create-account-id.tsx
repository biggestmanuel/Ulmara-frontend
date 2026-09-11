import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { createAccountId, getMe } from '../../lib/api/accountId';
import { setSecureItem, SecureStorageKeys } from '../../lib/storage/secureStorage';
import { useAuthGateStore } from '../../stores/authGateStore';
import type { ApiErrorShape } from '../../lib/api/client';
import { useThemeStore, ThemeColors } from '../../lib/theme';

function formatAccountId(id: string): string {
  return id.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

export default function CreateAccountId() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkAuthGate = useAuthGateStore((s) => s.check);

  // The backend assigns and persists the Account ID the moment this is called
  // — there's no preview/reserve step and no way to pick your own ID. If the
  // user already has one (e.g. they backed out and returned to this screen),
  // createAccountId() 409s, so fall back to fetching the existing one.
  const fetchId = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createAccountId();
      setAccountId(result.accountId);
    } catch (err) {
      const apiErr = err as ApiErrorShape;
      if (apiErr.status === 409) {
        try {
          const me = await getMe();
          setAccountId(me?.accountId?.accountId ?? null);
        } catch (meErr) {
          setError((meErr as ApiErrorShape).message ?? 'Could not load your Account ID.');
        }
      } else {
        setError(apiErr.message ?? 'Could not create your Account ID.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchId();
  }, [fetchId]);

  const handleConfirm = async () => {
    if (!accountId) return;
    setConfirming(true);
    setError(null);
    try {
      await setSecureItem(SecureStorageKeys.ACCOUNT_ID, accountId);

      // Generates keys for all 7 chains, persists mnemonics locally, and
      // registers only public addresses with the backend. Session token
      // (needed for auth) was already stored back at signup/login.
      // Dynamic import: registerWallets.ts (and keyGeneration.ts beneath it)
      // must not load at screen-mount time, or @ton/ton crashes before this
      // component even renders — see lib/registerWallets.ts for details.
      // TEMP DIAGNOSTIC — remove once the Buffer/TextEncoder crash is solved.
      console.log('[DIAG] typeof Buffer:', typeof Buffer);
      console.log('[DIAG] typeof Buffer.alloc:', typeof (Buffer as any)?.alloc);
      console.log('[DIAG] global.Buffer === Buffer:', (global as any).Buffer === Buffer);
      console.log('[DIAG] typeof global.TextEncoder:', typeof (global as any).TextEncoder);
      const { setupNonCustodialWallet } = await import('../../lib/registerWallets');
      await setupNonCustodialWallet();

      await checkAuthGate();
      router.replace('/(tabs)/home');
    } catch (err) {
      setError((err as ApiErrorShape).message ?? 'Something went wrong setting up your wallet.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title}>Your Account ID</Text>
        <Text style={styles.subtitle}>
          This is how people will send you crypto. It's unique to you and can't be changed later.
        </Text>

        <View style={styles.idCard}>
          {loading || !accountId ? (
            <ActivityIndicator color={colors.primaryHover} />
          ) : (
            <Text style={styles.idText}>{formatAccountId(accountId)}</Text>
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.footer}>
        <Pressable
          style={styles.primaryBtn}
          onPress={handleConfirm}
          disabled={loading || !accountId || confirming}
        >
          {confirming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Confirm & Continue</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 56, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  subtitle: {
    fontSize: 14, color: colors.textMuted, marginTop: 10, marginBottom: 36,
    textAlign: 'center', lineHeight: 20, paddingHorizontal: 12,
  },
  idCard: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, paddingVertical: 32, alignItems: 'center', justifyContent: 'center',
  },
  idText: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: 2 },
  error: { color: colors.error, fontSize: 13, marginTop: 16, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 32 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', height: 54,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
}
