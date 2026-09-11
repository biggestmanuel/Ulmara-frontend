import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWalletStore } from '../../stores/walletStore';
import { getUsdPrices, usdToNgn, type PriceSymbol } from '../../lib/prices/coingecko';
import { useThemeStore, ThemeColors } from '../../lib/theme';

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum', bsc: 'BSC', base: 'Base', polygon: 'Polygon',
  sol: 'Solana', tron: 'TRON', ton: 'TON',
};

// TODO: replace with lib/ramp/paystack.ts withdrawal call once that's wired
function fakeWithdraw(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1200));
}

export default function Withdraw() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  const balances = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [prices, setPrices] = useState<Record<PriceSymbol, number>>({} as any);
  const [loadingRate, setLoadingRate] = useState(false);

  useEffect(() => {
    if (!selectedId && balances.length > 0) setSelectedId(balances[0].id);
  }, [balances, selectedId]);

  const selected = useMemo(() => balances.find((b) => b.id === selectedId) ?? null, [balances, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setLoadingRate(true);
    getUsdPrices([selected.symbol as PriceSymbol])
      .then(setPrices)
      .catch((err) => console.error('Failed to fetch price:', err))
      .finally(() => setLoadingRate(false));
  }, [selected?.symbol]);

  const amt = parseFloat(amount) || 0;
  const balanceNum = selected ? parseFloat(selected.balance) || 0 : 0;
  const usdValue = selected ? amt * (prices[selected.symbol as PriceSymbol] ?? 0) : 0;
  const [estimatedNgn, setEstimatedNgn] = useState(0);

  useEffect(() => {
    if (usdValue <= 0) return setEstimatedNgn(0);
    usdToNgn(usdValue).then(setEstimatedNgn).catch(() => setEstimatedNgn(0));
  }, [usdValue]);

  const handleWithdraw = async () => {
    setError(null);
    if (!selected) return setError('Select an asset to withdraw');
    if (!amt || amt <= 0) return setError('Enter a valid amount');
    if (amt > balanceNum) return setError(`Insufficient ${selected.symbol} balance`);
    if (bankName.trim().length < 2) return setError('Enter your bank name');
    if (accountNumber.replace(/\D/g, '').length !== 10) return setError('Enter a valid 10-digit account number');

    setLoading(true);
    try {
      await fakeWithdraw();
      setDone(true);
      setTimeout(() => router.replace('/(tabs)/home'), 1200);
    } catch {
      setError('Withdrawal failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Text style={styles.successCheck}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Withdrawal Started</Text>
          <Text style={styles.successSubtitle}>Funds typically arrive within a few minutes</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Withdraw</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>From</Text>
          {isLoadingBalances ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : balances.length === 0 ? (
            <Text style={styles.balanceText}>No balances found yet</Text>
          ) : (
            <View style={styles.chipRow}>
              {balances.map((b) => (
                <Pressable
                  key={b.id}
                  style={[styles.chip, selectedId === b.id && styles.chipActive]}
                  onPress={() => setSelectedId(b.id)}
                >
                  <Text style={[styles.chipText, selectedId === b.id && styles.chipTextActive]}>
                    {b.symbol} · {CHAIN_LABELS[b.chainId] ?? b.chainId}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {selected && (
            <Text style={styles.balanceText}>Available: {selected.balance} {selected.symbol}</Text>
          )}

          <Text style={[styles.label, { marginTop: 20 }]}>Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          {amt > 0 && (
            loadingRate ? (
              <Text style={styles.estimate}>Fetching live rate…</Text>
            ) : (
              <Text style={styles.estimate}>≈ ₦{estimatedNgn.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</Text>
            )
          )}

          <Text style={[styles.label, { marginTop: 20 }]}>Bank Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. GTBank"
            placeholderTextColor={colors.textMuted}
            value={bankName}
            onChangeText={setBankName}
          />

          <Text style={[styles.label, { marginTop: 20 }]}>Account Number</Text>
          <TextInput
            style={styles.input}
            placeholder="0000000000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={accountNumber}
            onChangeText={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
          />

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleWithdraw} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Withdraw</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  back: { color: colors.textPrimary, fontSize: 28 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: '500' },
  input: {
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  balanceText: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  estimate: { color: colors.primaryHover, fontSize: 13, marginTop: 8, fontWeight: '600' },
  error: { color: colors.error, fontSize: 13, marginTop: 14 },
  footer: { paddingHorizontal: 20, paddingBottom: 32 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', height: 54,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.success}22`,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successCheck: { color: colors.success, fontSize: 32, fontWeight: '700' },
  successTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  successSubtitle: { color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 30 },
});
}
