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
    getPaymentLink(id)
      .then(setLink)
      .catch(() => setError('This payment link is unavailable.'))
      .finally(() => setLoading(false));
  }, [id]);

  const fulfill = async () => {
    if (!id || !link || link.status !== 'OPEN') return;
    setFulfilling(true);
    setError(null);
    try {
      const result = await fulfillPaymentLink(id, {
        amount: link.amount ?? undefined,
        symbol: link.symbol ?? undefined,
      });
      useTxStore.getState().upsertTransaction(result.transaction);
      router.replace(`/transaction/${result.transaction.id}`);
    } catch {
      setError('Payment could not be completed. No funds were sent.');
    } finally {
      setFulfilling(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Payment Request</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : link ? (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(link.requesterName || 'U').charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.title}>{link.requesterName || 'Ulmara user'}</Text>
            <Text style={styles.account}>Account ID {link.requesterAccountId}</Text>

            {link.amount && (
              <View style={styles.amountBox}>
                <Text style={styles.amount}>
                  {link.amount} {link.symbol}
                </Text>
              </View>
            )}

            {link.note && <Text style={styles.note}>{link.note}</Text>}

            {link.status !== 'OPEN' ? (
              <Text style={styles.statusNotice}>This request is {link.status.toLowerCase()}.</Text>
            ) : (
              <>
                <Text style={styles.warning}>
                  This will create a blockchain payment using the requested amount and the backend-selected route.
                </Text>
                <Pressable style={styles.primary} onPress={fulfill} disabled={fulfilling}>
                  {fulfilling ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Pay Request</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center' },
    backText: { color: colors.textPrimary, fontSize: 28 },
    headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
    body: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: 'center',
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
    title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 4 },
    account: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
    amountBox: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 24,
      marginTop: 20,
      marginBottom: 8,
    },
    amount: { color: colors.textPrimary, fontSize: 28, fontWeight: '800', textAlign: 'center' },
    note: { color: colors.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center' },
    warning: { color: colors.warning, fontSize: 12, textAlign: 'center', marginTop: 18, lineHeight: 17 },
    statusNotice: { color: colors.error, fontSize: 14, fontWeight: '600', marginTop: 16 },
    primary: {
      marginTop: 24,
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 16,
      width: '100%',
      alignItems: 'center',
    },
    primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    error: { color: colors.error, textAlign: 'center', fontSize: 15, paddingHorizontal: 20 },
  });
}
