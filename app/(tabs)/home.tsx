import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { useUserStore } from '../../stores/userStore';
import { useWalletStore } from '../../stores/walletStore';
import { useThemeStore } from '../../lib/theme';

function formatAccountId(id?: string | null): string {
  if (!id) return '---- --- ---';
  return id.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

// 4 Quick Actions with squared curved-edge buttons (squircles)
const QUICK_ACTIONS = [
  { label: 'Send', symbol: '↗', route: '/send' },
  { label: 'Receive', symbol: '↙', route: '/receive' },
  { label: 'Deposit Fiat', symbol: '₦', route: '/deposit-withdraw/deposit' },
  { label: 'Withdraw', symbol: '⤓', route: '/deposit-withdraw/withdraw' },
] as const;

// TODO: replace with stores/txStore + lib/api/transactions
const MOCK_RECENT_TRANSACTIONS = [
  { id: '1', title: 'Transfer from 8821 042 119', amount: '+₦150,000.00', sub: 'Today, 1:42 PM', isPositive: true },
  { id: '2', title: 'Sent to 0192 481 992', amount: '-₦25,000.00', sub: 'Yesterday, 8:15 PM', isPositive: false },
  { id: '3', title: 'Deposit via Bank Transfer', amount: '+₦50,000.00', sub: 'Sep 07, 11:20 AM', isPositive: true },
];

export default function Home() {
  const { colors, isDark } = useThemeStore();
  const [balanceHidden, setBalanceHidden] = useState(false);

  const accountId = useUserStore((s) => s.accountId);
  const profile = useUserStore((s) => s.profile);
  const balances = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);

  const displayName = profile?.name?.trim() || 'Biggest Manuel';
  const initial = displayName.charAt(0).toUpperCase();

  const USD_TO_NGN = 1500;

  const totalBalanceUsd = useMemo(() => {
    return balances.reduce((acc, curr) => acc + (parseFloat(curr.balance) || 0), 0);
  }, [balances]);

  const totalBalanceNgn = totalBalanceUsd * USD_TO_NGN;

  const handleCopyId = async () => {
    if (accountId) {
      await Clipboard.setStringAsync(accountId);
      Alert.alert('Copied', 'Account ID copied to clipboard');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isLoadingBalances} onRefresh={refreshBalances} tintColor={colors.primary} />
        }
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.userInfo}>
            <Pressable style={[styles.avatar, { backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/profile')}>
              <Text style={styles.avatarText}>{initial}</Text>
            </Pressable>
            <View style={{ marginLeft: 12 }}>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>{displayName}</Text>
              <View style={[styles.badge, { backgroundColor: isDark ? colors.surfaceElevated : colors.primaryLight }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>Level 1 Verified ★</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerIcons}>
            <Pressable
              style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/(tabs)/profile')}
              hitSlop={10}
            >
              <Text style={{ fontSize: 18 }}>🔔</Text>
            </Pressable>
          </View>
        </View>

        {/* Burnt Orange Hero Card */}
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          {/* Top of card: Account ID + Copy */}
          <View style={styles.heroCardTop}>
            <View style={styles.idGroup}>
              <Text style={styles.idLabel}>Account ID: </Text>
              <Text style={styles.idValue}>{formatAccountId(accountId)}</Text>
            </View>
            <Pressable style={styles.copyPill} onPress={handleCopyId} hitSlop={10}>
              <Text style={styles.copyPillText}>Copy ❐</Text>
            </Pressable>
          </View>

          {/* Balance */}
          <View style={styles.balanceContainer}>
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceTitle}>Total Balance</Text>
              <Pressable onPress={() => setBalanceHidden(!balanceHidden)} hitSlop={10}>
                <Text style={styles.eyeBtn}>{balanceHidden ? '👁 Show' : '👁‍🗨 Hide'}</Text>
              </Pressable>
            </View>

            <Text style={styles.ngnAmount}>
              {balanceHidden
                ? '••••••••'
                : `₦${totalBalanceNgn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </Text>

            <Text style={styles.usdSub}>
              {balanceHidden ? '••••' : `≈ $${totalBalanceUsd.toFixed(2)} USD`}
            </Text>
          </View>

          {/* Dual Action Buttons */}
          <View style={styles.cardActionsRow}>
            <Pressable
              style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
              onPress={() => router.push('/deposit-withdraw/deposit')}
            >
              <Text style={[styles.cardActionBtnTextPrimary, { color: colors.primary }]}>+ Add Money</Text>
            </Pressable>
            <Pressable
              style={[styles.cardActionBtn, styles.cardActionBtnSecondary]}
              onPress={() => router.push('/send')}
            >
              <Text style={styles.cardActionBtnTextSecondary}>⇄ Transfer</Text>
            </Pressable>
          </View>
        </View>

        {/* 4 Quick Actions: Squared with Curved Edges (Squircles) */}
        <View style={styles.quickActionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <View key={action.label} style={styles.quickActionCol}>
              <Pressable
                style={[
                  styles.squircleBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => router.push(action.route as any)}
              >
                <Text style={[styles.squircleSymbol, { color: colors.primary }]}>{action.symbol}</Text>
              </Pressable>
              <Text style={[styles.squircleLabel, { color: colors.textPrimary }]}>{action.label}</Text>
            </View>
          ))}
        </View>

        {/* Recent Transactions Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Transactions</Text>
          <Pressable onPress={() => router.push('/(tabs)/balances')}>
            <Text style={[styles.viewAllText, { color: colors.primary }]}>View All →</Text>
          </Pressable>
        </View>

        <View style={[styles.transactionsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {MOCK_RECENT_TRANSACTIONS.map((tx, idx) => (
            <View
              key={tx.id}
              style={[
                styles.txRow,
                idx < MOCK_RECENT_TRANSACTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
              ]}
            >
              <View style={styles.txLeft}>
                <View
                  style={[
                    styles.txIconBox,
                    { backgroundColor: tx.isPositive ? (isDark ? '#1C2E24' : '#EAF7EE') : (isDark ? '#2E1C1C' : '#FEECEC') },
                  ]}
                >
                  <Text style={{ fontSize: 16, color: tx.isPositive ? colors.success : colors.error }}>
                    {tx.isPositive ? '↓' : '↑'}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.txTitle, { color: colors.textPrimary }]}>{tx.title}</Text>
                  <Text style={[styles.txSub, { color: colors.textMuted }]}>{tx.sub}</Text>
                </View>
              </View>

              <Text
                style={[
                  styles.txAmount,
                  { color: tx.isPositive ? colors.success : colors.textPrimary },
                ]}
              >
                {tx.amount}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingBottom: 36 },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  userName: { fontSize: 16, fontWeight: '700' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  headerIcons: { flexDirection: 'row', gap: 10 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: 24,
    padding: 22,
    marginTop: 8,
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  heroCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  idGroup: { flexDirection: 'row', alignItems: 'center' },
  idLabel: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 13, fontWeight: '500' },
  idValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  copyPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  copyPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  balanceContainer: { marginVertical: 16 },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceTitle: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, fontWeight: '600' },
  eyeBtn: { color: 'rgba(255, 255, 255, 0.95)', fontSize: 12, fontWeight: '700' },
  ngnAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  usdSub: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, marginTop: 3, fontWeight: '600' },
  cardActionsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cardActionBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionBtnPrimary: { backgroundColor: '#FFFFFF' },
  cardActionBtnTextPrimary: { fontSize: 14, fontWeight: '800' },
  cardActionBtnSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cardActionBtnTextSecondary: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
    paddingHorizontal: 4,
  },
  quickActionCol: { alignItems: 'center', width: 76 },
  squircleBtn: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  squircleSymbol: { fontSize: 24, fontWeight: '800' },
  squircleLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  viewAllText: { fontSize: 13, fontWeight: '700' },
  transactionsCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  txIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: { fontSize: 14, fontWeight: '700' },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '800' },
});