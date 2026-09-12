import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { useTxStore } from '../../stores/txStore';
import type { Transaction } from '../../lib/api/transactions';

const FILTERS = ['All', 'Sent', 'Received', 'Deposits'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(tx: Transaction, filter: Filter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Sent') return tx.direction === 'sent';
  if (filter === 'Received') return tx.direction === 'received';
  return false;
}

function txLabel(tx: Transaction): string {
  return tx.direction === 'sent' ? `To ${tx.counterpartyAccountId}` : `From ${tx.counterpartyAccountId}`;
}

function txIcon(tx: Transaction): string {
  return tx.direction === 'sent' ? '↑' : '↓';
}

export default function Activity() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const { items, isLoading, isLoadingMore, nextCursor, fetchInitial, fetchMore } = useTxStore();
  const [filter, setFilter] = useState<Filter>('All');

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const filtered = useMemo(
    () => items.filter((tx) => matchesFilter(tx, filter)),
    [items, filter]
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
        refreshing={isLoading}
        onRefresh={fetchInitial}
        onEndReached={() => nextCursor && fetchMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.txRow} onPress={() => router.push(`/transaction/${item.id}`)}>
            <View style={styles.txIconWrap}>
              <Text style={styles.txIcon}>{txIcon(item)}</Text>
            </View>
            <View style={styles.txDetails}>
              <Text style={styles.txLabel}>{txLabel(item)}</Text>
              <Text style={styles.txMeta}>
                {item.network} · {new Date(item.createdAt).toLocaleDateString()}
                {item.status === 'processing' ? ' · Processing' : item.status === 'failed' ? ' · Failed' : ''}
              </Text>
            </View>
            <Text style={[styles.txAmount, item.amount.startsWith('+') && styles.txAmountPositive]}>
              {item.direction === 'sent' ? '-' : '+'}{item.amount} {item.symbol}
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
