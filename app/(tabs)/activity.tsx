import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';

import {
  Amount,
  Badge,
  EmptyState,
  ListRow,
  LoadingSpinner,
  Screen,
  SegmentedControl,
  Typography,
} from '../../components/ui';
import { useTxStore } from '../../stores/txStore';
import type { Transaction } from '../../lib/api/transactions';
import { friendlyError } from '../../lib/api/client';
import { isTokenSymbol } from '../../constants/tokens';
import { getEvmNetworkName } from '../../lib/chains/evmConfig';
import { CHAINS } from '../../constants/chains';
import { formatAccountId } from '../../lib/format';
import { gutter, radius, space, useThemeStore } from '../../lib/theme';

type Filter = 'All' | 'Sent' | 'Received';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Sent', label: 'Sent' },
  { value: 'Received', label: 'Received' },
];

function matchesFilter(tx: Transaction, filter: Filter): boolean {
  if (filter === 'All') return true;
  return filter === 'Sent' ? tx.direction === 'sent' : tx.direction === 'received';
}

function networkLabel(wire: string): string {
  const chain = wire.toLowerCase();
  if (chain === 'eth') return getEvmNetworkName('eth');
  if (chain === 'bsc' || chain === 'base' || chain === 'polygon') return getEvmNetworkName(chain);
  return CHAINS[chain as keyof typeof CHAINS]?.name ?? wire.toUpperCase();
}

/**
 * Transaction history.
 *
 * ## What changed
 *
 * - The filter chips become a `SegmentedControl` (tab list with `selected`
 *   state) rather than ungrouped `accessibilityRole="radio"` chips.
 * - The empty state is the shared `EmptyState` — a glyph, a line of copy and a
 *   retry action — rather than a bare centred grey sentence that was empty
 *   string (`' '`) while an error was showing, so the list appeared to be
 *   silently blank on failure.
 * - An error now has a visible retry button in the same row, with a real
 *   accessible name.
 * - The status pill becomes a `Badge` with an **icon**, so "Failed" and
 *   "Processing" are distinguishable without relying on red-versus-blue.
 * - The amount uses the shared `Amount`, so a received transfer carries a
 *   leading arrow *and* the success tint, and a sent one stays in ink rather
 *   than being coloured like an error. Spending money is not a failure.
 */
export default function Activity() {
  const colors = useThemeStore((state) => state.colors);
  const items = useTxStore((s) => s.items);
  const isLoading = useTxStore((s) => s.isLoading);
  const isLoadingMore = useTxStore((s) => s.isLoadingMore);
  const nextCursor = useTxStore((s) => s.nextCursor);
  const fetchInitial = useTxStore((s) => s.fetchInitial);
  const fetchMore = useTxStore((s) => s.fetchMore);

  const [filter, setFilter] = useState<Filter>('All');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetchInitial().catch((err) => setError(friendlyError(err, 'Could not load your transactions.')));
  }, [fetchInitial]);

  const filtered = useMemo(() => items.filter((tx) => matchesFilter(tx, filter)), [items, filter]);

  const openTransaction = useCallback((id: string) => router.push(`/transaction/${id}`), []);

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => <TransactionRow transaction={item} onPress={openTransaction} />,
    [openTransaction]
  );

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  const onEndReached = useCallback(() => {
    if (nextCursor && !isLoadingMore) void fetchMore();
  }, [nextCursor, isLoadingMore, fetchMore]);

  return (
    <Screen scroll={false} contentStyle={styles.screen} testID="activity-screen">
      <View style={styles.headings}>
        <Typography variant="title">Activity</Typography>
        <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
          Every transfer on this account
        </Typography>
      </View>

      <SegmentedControl<Filter>
        accessibilityLabel="Transaction direction"
        value={filter}
        onChange={setFilter}
        options={FILTERS}
      />

      {error ? (
        <View style={[styles.errorRow, { backgroundColor: colors.errorTint }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Typography variant="caption" color={colors.error} style={styles.errorText}>
            {error}
          </Typography>
          <Typography
            variant="label"
            color={colors.error}
            accessibilityRole="button"
            accessibilityLabel="Retry loading transactions"
            onPress={() => {
              setError(null);
              void fetchInitial();
            }}
          >
            Retry
          </Typography>
        </View>
      ) : null}

      <FlashList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        drawDistance={400}
        contentContainerStyle={styles.list}
        onRefresh={fetchInitial}
        refreshing={isLoading}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <LoadingSpinner size="large" label="Loading transactions" />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={error ? 'Could not load' : 'No transactions yet'}
              body={
                error
                  ? undefined
                  : filter === 'All'
                    ? 'Transfers you send and receive will appear here.'
                    : `You have no ${filter.toLowerCase()} transactions.`
              }
              actionLabel={error ? 'Try again' : 'Send a transfer'}
              onAction={() => {
                if (error) {
                  setError(null);
                  void fetchInitial();
                } else {
                  router.push('/send');
                }
              }}
            />
          )
        }
        ListFooterComponent={
          isLoadingMore ? <LoadingSpinner label="Loading more" /> : null
        }
      />
    </Screen>
  );
}

/**
 * Memoised row. FlashList recycles aggressively, and an unmemoised row re-renders
 * every visible row on each store update (a new page arriving, a status flip, a
 * filter change).
 */
const TransactionRow = memo(function TransactionRow({
  transaction,
  onPress,
}: {
  transaction: Transaction;
  onPress: (id: string) => void;
}) {
  const colors = useThemeStore((state) => state.colors);
  const { direction, status } = transaction;
  const isToken = isTokenSymbol(transaction.symbol);
  const counterparty = /^\d{10}$/.test(transaction.counterpartyAccountId)
    ? formatAccountId(transaction.counterpartyAccountId)
    : transaction.counterpartyAccountId;

  return (
    <ListRow
      title={`${direction === 'sent' ? 'To' : 'From'} ${counterparty}`}
      subtitle={`${transaction.symbol}${isToken ? ' (ERC-20)' : ''} · ${networkLabel(transaction.network)} · ${new Date(transaction.createdAt).toLocaleDateString()}`}
      showSeparator={false}
      onPress={() => onPress(transaction.id)}
      accessibilityLabel={`${direction === 'sent' ? 'Sent' : 'Received'} ${transaction.amount} ${transaction.symbol} ${status === 'complete' ? '' : `, ${status}`}`}
      accessibilityHint="Opens the transaction detail"
      leading={
        <View
          style={[
            styles.txIcon,
            { backgroundColor: direction === 'sent' ? colors.surfaceElevated : colors.successTint },
          ]}
        >
          <Ionicons
            name={direction === 'sent' ? 'arrow-up' : 'arrow-down'}
            size={17}
            color={direction === 'sent' ? colors.textSecondary : colors.success}
          />
        </View>
      }
      trailing={
        <View style={styles.trailing}>
          <Amount
            value={`${direction === 'received' ? '+' : '-'}${transaction.amount}`}
            symbol={transaction.symbol}
            direction={direction === 'received' ? 'in' : 'out'}
          />
          {status !== 'complete' ? (
            <Badge
              label={status === 'failed' ? 'Failed' : 'Processing'}
              tone={status === 'failed' ? 'danger' : 'primary'}
              icon={status === 'failed' ? 'close-circle' : 'time-outline'}
            />
          ) : null}
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  screen: { paddingTop: space.md },
  headings: { marginBottom: space.lg },
  subtitle: { marginTop: space.xs },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.chip,
    marginTop: space.lg,
  },
  errorText: { flex: 1 },

  list: {
    paddingTop: space.lg,
    paddingBottom: space.xxxl,
    marginHorizontal: -gutter,
    paddingHorizontal: gutter,
  },

  txIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  trailing: { alignItems: 'flex-end', gap: 4 },
});
