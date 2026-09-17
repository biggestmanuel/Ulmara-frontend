import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { getPaymentLink, fulfillPaymentLink, type PaymentLink } from '../../lib/api/transactions';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { useTxStore } from '../../stores/txStore';

export default function PayLink() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [fulfilling, setFulfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getPaymentLink(id).then(setLink).catch(() => setError('This payment link is unavailable.')).finally(() => setLoading(false));
  }, [id]);

  const fulfill = async () => {
    if (!id || !link || link.status !== 'OPEN') return;
    setFulfilling(true); setError(null);
    try {
      const result = await fulfillPaymentLink(id, { amount: link.amount ?? undefined, symbol: link.symbol ?? undefined });
      useTxStore.getState().upsertTransaction(result.transaction);
      router.replace(`/transaction/${result.transaction.id}`);
    } catch {
      setError('Payment could not be completed. No funds were sent.');
    } finally { setFulfilling(false); }
  };

  return <SafeAreaView style={styles.container}><View style={styles.body}>
    {loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.error}>{error}</Text> : link ? <>
      <Text style={styles.eyebrow}>PAYMENT REQUEST</Text>
      <Text style={styles.title}>{link.requesterName || 'Ulmara user'}</Text>
      <Text style={styles.account}>Account ID {link.requesterAccountId}</Text>
      {link.amount && <Text style={styles.amount}>{link.amount} {link.symbol}</Text>}
      {link.note && <Text style={styles.note}>{link.note}</Text>}
      {link.status !== 'OPEN' && <Text style={styles.error}>This request is {link.status.toLowerCase()}.</Text>}
      {link.status === 'OPEN' && <><Text style={styles.warning}>This will create a blockchain payment using the requested amount and the backend-selected route.</Text><Pressable style={styles.primary} onPress={fulfill} disabled={fulfilling}>{fulfilling ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Pay request</Text>}</Pressable></>}
    </> : null}
  </View></SafeAreaView>;
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, body: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }, eyebrow: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1 }, title: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 12 }, account: { color: colors.textMuted, marginTop: 8 }, amount: { color: colors.textPrimary, fontSize: 32, fontWeight: '800', marginTop: 28 }, note: { color: colors.textSecondary, marginTop: 12 }, warning: { color: colors.warning, fontSize: 12, textAlign: 'center', marginTop: 20 }, primary: { marginTop: 32, backgroundColor: colors.primary, padding: 16, borderRadius: 14, width: '100%', alignItems: 'center' }, primaryText: { color: '#fff', fontWeight: '700' }, error: { color: colors.error, textAlign: 'center' } });
}
