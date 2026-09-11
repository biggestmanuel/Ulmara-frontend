import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUserStore } from '../../stores/userStore';
import { useWalletStore } from '../../stores/walletStore';

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum', bsc: 'BSC', base: 'Base', polygon: 'Polygon',
  sol: 'Solana', tron: 'TRON', ton: 'TON',
};

// TODO: replace with stores/txStore + lib/api/transactions
type Tx = {
  id: string;
  type: 'sent' | 'received' | 'deposit';
  counterparty: string;
  amount: string;
  asset: string;
  time: string;
};

const MOCK_TRANSACTIONS: Tx[] = [
  { id: '1', type: 'received', counterparty: '7729 104 552', amount: '+120.00', asset: 'USDT', time: '2h ago' },
  { id: '2', type: 'sent', counterparty: '0192 883 210', amount: '-45.00', asset: 'USDT', time: 'Yesterday' },
  { id: '3', type: 'deposit', counterparty: 'Bank Deposit', amount: '+50,000.00', asset: 'NGN', time: '2 days ago' },
];

const QUICK_ACTIONS = [
  { label: 'Send', symbol: '↑', route: '/send' },
  { label: 'Receive', symbol: '↓', route: '/receive' },
  { label: 'Deposit', symbol: '+', route: '/deposit-withdraw/deposit' },
  { label: 'Withdraw', symbol: '−', route: '/deposit-withdraw/withdraw' },
] as const;

function txLabel(tx: Tx): string {
  if (tx.type === 'deposit') return tx.counterparty;
  return tx.type === 'sent' ? `To ${tx.counterparty}` : `From ${tx.counterparty}`;
}

export default function Home() {
  const [balanceHidden, setBalanceHidden] = useState(false);
  const accountId = useUserStore((s) => s.accountId);
  const balances = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);

  // Real per-chain breakdown. USD totals aren't computed here yet since
  // that needs a live price feed multiplied in — see lib/prices/coingecko.ts,
  // not yet wired into this screen's total.
  const hasBalances = balances.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Account ID</Text>
            <Text style={styles.accountId}>{accountId ?? '—'}</Text>
          </View>
          <Pressable style={styles.avatar} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.avatarText}>{(accountId ?? 'U').charAt(0)}</Text>
          </Pressable>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceHeaderRow}>
            <Text style={styles.balanceLabel}>Assets</Text>
            <Pressable onPress={() => setBalanceHidden((v) => !v)}>
              <Text style={styles.eyeIcon}>{balanceHidden ? '◌' : '◉'}</Text>
            </Pressable>
          </View>

          {isLoadingBalances ? (
            <ActivityIndicator color="#6C5CE7" style={{ marginTop: 16 }} />
          ) : !hasBalances ? (
            <Text style={styles.emptyText}>No balances yet</Text>
          ) : (
            <View style={{ marginTop: 12 }}>
              {balances.map((b) => (
                <Pressable
                  key={b.id}
                  style={styles.assetRow}
                  onPress={() => router.push({ pathname: '/wallet/addresses', params: { chain: b.chainId } })}
                >
                  <View>
                    <Text style={styles.assetSymbol}>{b.symbol}</Text>
                    <Text style={styles.assetChain}>{CHAIN_LABELS[b.chainId] ?? b.chainId}</Text>
                  </View>
                  <Text style={styles.assetBalance}>
                    {balanceHidden ? '••••' : b.balance}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={styles.addressesLink} onPress={() => router.push('/wallet/addresses')}>
            <Text style={styles.addressesLinkText}>View receiving addresses →</Text>
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable key={a.label} style={styles.actionItem} onPress={() => router.push(a.route as any)}>
              <View style={styles.actionCircle}>
                <Text style={styles.actionSymbol}>{a.symbol}</Text>
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Pressable onPress={() => router.push('/(tabs)/activity')}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        <FlatList
          data={MOCK_TRANSACTIONS}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.txRow}
              onPress={() => router.push(`/transaction/${item.id}`)}
            >
              <View style={styles.txIconWrap}>
                <Text style={styles.txIcon}>
                  {item.type === 'sent' ? '↑' : item.type === 'received' ? '↓' : '+'}
                </Text>
              </View>
              <View style={styles.txDetails}>
                <Text style={styles.txLabel}>{txLabel(item)}</Text>
                <Text style={styles.txTime}>{item.time}</Text>
              </View>
              <Text style={[styles.txAmount, item.amount.startsWith('+') && styles.txAmountPositive]}>
                {item.amount} {item.asset}
              </Text>
            </Pressable>
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 12, color: '#9A9AA5', fontWeight: '500' },
  accountId: { fontSize: 18, color: '#FFFFFF', fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#6C5CE7',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  balanceCard: {
    backgroundColor: '#17171D', borderRadius: 20, borderWidth: 1, borderColor: '#26262E',
    padding: 22, marginBottom: 24,
  },
  balanceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { fontSize: 13, color: '#9A9AA5', fontWeight: '500' },
  eyeIcon: { color: '#9A9AA5', fontSize: 16 },
  emptyText: { color: '#5C5C66', fontSize: 13, marginTop: 12 },
  assetRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1D1D24',
  },
  assetSymbol: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  assetChain: { color: '#5C5C66', fontSize: 12, marginTop: 2 },
  assetBalance: { color: '#D0D0D6', fontSize: 15, fontWeight: '600' },
  addressesLink: { marginTop: 14 },
  addressesLinkText: { color: '#8C7AFF', fontSize: 13, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  actionItem: { alignItems: 'center', gap: 8 },
  actionCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#17171D',
    borderWidth: 1, borderColor: '#26262E', alignItems: 'center', justifyContent: 'center',
  },
  actionSymbol: { color: '#8C7AFF', fontSize: 20, fontWeight: '700' },
  actionLabel: { color: '#D0D0D6', fontSize: 12, fontWeight: '500' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  seeAll: { color: '#8C7AFF', fontSize: 13, fontWeight: '600' },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  txIconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#17171D',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  txIcon: { color: '#9A9AA5', fontSize: 16, fontWeight: '700' },
  txDetails: { flex: 1 },
  txLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  txTime: { color: '#5C5C66', fontSize: 12, marginTop: 2 },
  txAmount: { color: '#D0D0D6', fontSize: 14, fontWeight: '600' },
  txAmountPositive: { color: '#4CD97B' },
});
