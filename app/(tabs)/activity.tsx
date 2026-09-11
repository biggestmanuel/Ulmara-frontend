import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';

// TODO: replace with stores/txStore + lib/api/transactions
type Tx = {
  id: string;
  type: 'sent' | 'received' | 'deposit' | 'withdraw';
  counterparty: string;
  amount: string;
  asset: string;
  network: string;
  time: string;
  status: 'complete' | 'processing';
};

const MOCK_TRANSACTIONS: Tx[] = [
  { id: '1', type: 'received', counterparty: '7729 104 552', amount: '+120.00', asset: 'USDT', network: 'TON', time: '2h ago', status: 'complete' },
  { id: '2', type: 'sent', counterparty: '0192 883 210', amount: '-45.00', asset: 'USDT', network: 'BSC', time: 'Yesterday', status: 'complete' },
  { id: '3', type: 'deposit', counterparty: 'Bank Deposit', amount: '+50,000.00', asset: 'NGN', network: 'Bachs', time: '2 days ago', status: 'complete' },
  { id: '4', type: 'sent', counterparty: '5510 992 034', amount: '-0.05', asset: 'ETH', network: 'ETH', time: '3 days ago', status: 'processing' },
  { id: '5', type: 'withdraw', counterparty: 'Bank Withdrawal', amount: '-20,000.00', asset: 'NGN', network: 'Bachs', time: '5 days ago', status: 'complete' },
];

const FILTERS = ['All', 'Sent', 'Received', 'Deposits'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(tx: Tx, filter: Filter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Sent') return tx.type === 'sent';
  if (filter === 'Received') return tx.type === 'received';
  return tx.type === 'deposit' || tx.type === 'withdraw';
}

function txLabel(tx: Tx): string {
  if (tx.type === 'deposit' || tx.type === 'withdraw') return tx.counterparty;
  return tx.type === 'sent' ? `To ${tx.counterparty}` : `From ${tx.counterparty}`;
}

function txIcon(tx: Tx): string {
  if (tx.type === 'sent' || tx.type === 'withdraw') return '↑';
  return tx.type === 'received' ? '↓' : '+';
}

export default function Activity() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [filter, setFilter] = useState<Filter>('All');

  const filtered = useMemo(
    () => MOCK_TRANSACTIONS.filter((tx) => matchesFilter(tx, filter)),
    [filter]
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Activity</Text>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No transactions in this category</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.txRow} onPress={() => router.push(`/transaction/${item.id}`)}>
            <View style={styles.txIconWrap}>
              <Text style={styles.txIcon}>{txIcon(item)}</Text>
            </View>
            <View style={styles.txDetails}>
              <Text style={styles.txLabel}>{txLabel(item)}</Text>
              <Text style={styles.txMeta}>
                {item.network} · {item.time}
                {item.status === 'processing' ? ' · Processing' : ''}
              </Text>
            </View>
            <Text style={[styles.txAmount, item.amount.startsWith('+') && styles.txAmountPositive]}>
              {item.amount} {item.asset}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  list: { paddingTop: 8, paddingBottom: 32 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.surface },
  txIconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  txIcon: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  txDetails: { flex: 1 },
  txLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  txMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  txAmount: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  txAmountPositive: { color: colors.success },
});
}
