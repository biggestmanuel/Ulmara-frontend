import { useCallback, useEffect, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  AccountId,
  Amount,
  Badge,
  CopyToast,
  EmptyState,
  IconButton,
  InitialsAvatar,
  ListRow,
  Rule,
  SectionLabel,
  Touchable,
  Typography,
  useCopyToast,
} from '../../components/ui';
import { useUserStore } from '../../stores/userStore';
import { useWalletStore } from '../../stores/walletStore';
import { useTxStore } from '../../stores/txStore';
import { usePortfolioValue } from '../../hooks/usePortfolioValue';
import { getEvmNetworkName } from '../../lib/chains/evmConfig';
import { CHAINS } from '../../constants/chains';
import { gutter, space, useThemeStore } from '../../lib/theme';

/**
 * Home.
 *
 * ## The structural change
 *
 * The previous Home opened with a **saturated hero card** carrying
 * `shadowOpacity: 0.25` / `elevation: 8`, on which the Account ID, the balance
 * and the quick actions were all set in white over a translucent
 * `rgba(255,255,255,0.2)` fill. That treatment is why the screen read as a
 * crypto app: a glowing coloured slab is the visual shorthand for exactly the
 * category this product is trying to move away from, and the white-on-accent
 * overlays meant the component could only ever exist in one colourway.
 *
 * The redesign treats Home as a **page of a ledger** instead:
 *
 * - a quiet identity line (avatar, name, tier);
 * - the **Account ID set as the app's signature object** — tabular figures, wide
 *   tracking, plain ink on the page, with its own copy control;
 * - the **balance as the largest type in the product**, in the serif display
 *   step, with tabular figures so it does not jitter as prices tick;
 * - Send and Receive as a **pair of full-width primary/secondary actions**
 *   directly under the balance, thumb-reachable — previously a row of four small
 *   1-up "squircle" buttons, two of which were empty;
 * - recent activity as a plain list with hairline rules, not a boxed card.
 *
 * No shadows, no gradients, no tinted slab. The balance reads as the most
 * important thing on the screen because it is the biggest and has the most
 * space around it.
 */
export default function Home() {
  const colors = useThemeStore((state) => state.colors);

  const accountId = useUserStore((s) => s.accountId);
  const profile = useUserStore((s) => s.profile);
  const balances = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);
  const balanceWarning = useWalletStore((s) => s.warning);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);
  const transactions = useTxStore((s) => s.items);
  const fetchTransactions = useTxStore((s) => s.fetchInitial);

  const { usd, ngn, isLoading: isPricing } = usePortfolioValue();

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Signup does not collect a name (the backend returns `name: null` unless the
  // user sets one later), so this is the common case, not an edge case. The
  // Account ID is the user's actual public identity in this product.
  const displayName = profile?.name?.trim() || 'Welcome back';

  const topAssets = useMemo(
    () =>
      balances
        .filter((entry) => Number(entry.balance) > 0)
        .sort((a, b) => Number(b.balance) - Number(a.balance))
        .slice(0, 3),
    [balances]
  );

  const { copyToClipboard, message: toastMessage, visible: toastVisible } = useCopyToast();

  const handleCopyId = useCallback(async () => {
    if (accountId) await copyToClipboard(accountId, 'Account ID copied');
  }, [accountId, copyToClipboard]);

  const primaryAmount =
    ngn !== null
      ? `₦${ngn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : usd !== null
        ? `$${usd.toFixed(2)}`
        : isPricing
          ? 'Loading…'
          : 'Unavailable';

  const secondaryAmount =
    usd !== null
      ? `≈ $${usd.toFixed(2)} USD`
      : isPricing
        ? 'Fetching live prices…'
        : 'Live prices unavailable';

  const recent = transactions.slice(0, 4);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoadingBalances}
          onRefresh={refreshBalances}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.column}>
        {/* --- identity ---------------------------------------------------- */}
        <View style={styles.identity}>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={displayName}
            accessibilityHint="Opens your profile"
            onPress={() => router.push('/(tabs)/profile')}
            pressScale={0.94}
            style={styles.identityLeft}
          >
            <InitialsAvatar initials={displayName} size={38} />
            <View style={styles.identityText}>
              <Typography variant="titleSm" numberOfLines={1}>
                {displayName}
              </Typography>
              <Badge label="Verified" tone="success" icon="checkmark-circle" />
            </View>
          </Touchable>

          <IconButton
            accessibilityLabel="Notifications"
            accessibilityHint="Shows your transaction notifications"
            onPress={() => router.push('/notifications')}
            variant="filled"
          >
            <Ionicons name="notifications-outline" size={19} color={colors.textPrimary} />
          </IconButton>
        </View>

        {/* --- the Account ID, the app's signature object --------------------- */}
        <AccountId value={accountId ?? ''} onCopy={handleCopyId} />

        <Rule />

        {/* --- balance: the largest type in the product ----------------------- */}
        <View style={styles.balanceBlock}>
          <SectionLabel>TOTAL BALANCE</SectionLabel>
          <Amount value={primaryAmount} secondary={secondaryAmount} size="hero" muted={ngn === null && usd === null && !isPricing} />
        </View>

        {balanceWarning ? (
          <Typography variant="caption" color={colors.warning} style={styles.warning}>
            {balanceWarning}
          </Typography>
        ) : null}

        {/* --- holdings ------------------------------------------------------ */}
        {topAssets.length > 0 ? (
          <View style={styles.holdings}>
            <SectionLabel>HOLDINGS</SectionLabel>
            {topAssets.map((asset) => (
              <View key={asset.id} style={styles.holdingRow}>
                <Typography variant="titleSm" color={colors.textSecondary}>
                  {asset.symbol}
                  {asset.isToken ? ' · ERC-20' : ''}
                </Typography>
                <Typography variant="amountSm" numeric>
                  {formatAmount(asset.balance)} {asset.symbol}
                </Typography>
              </View>
            ))}
          </View>
        ) : null}

        {/* --- the two actions that matter ------------------------------------ */}
        <View style={styles.actions}>
          <ActionTile
            icon="arrow-up"
            label="Send"
            hint="Send to an Account ID"
            primary
            onPress={() => router.push('/send')}
          />
          <ActionTile
            icon="arrow-down"
            label="Receive"
            hint="Get paid with your Account ID"
            onPress={() => router.push('/receive')}
          />
        </View>

        {/* --- recent activity ------------------------------------------------ */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Typography variant="heading">Recent activity</Typography>
            {transactions.length > 0 ? (
              <Touchable
                accessibilityRole="button"
                accessibilityLabel="See all transactions"
                onPress={() => router.push('/(tabs)/activity')}
                pressScale={0.96}
              >
                <Typography variant="label" color={colors.primary}>
                  See all
                </Typography>
              </Touchable>
            ) : null}
          </View>

          {recent.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="Nothing yet"
              body="Your transfers will appear here as soon as you make one."
              actionLabel="Send your first transfer"
              onAction={() => router.push('/send')}
            />
          ) : (
            <View style={styles.list}>
              {recent.map((tx, index) => (
                <ListRow
                  key={tx.id}
                  title={`${tx.direction === 'received' ? 'Received from' : 'Sent to'} ${tx.counterpartyAccountId}`}
                  subtitle={`${networkLabel(tx.network)} · ${new Date(tx.createdAt).toLocaleDateString()}`}
                  showSeparator={index < recent.length - 1}
                  onPress={() => router.push(`/transaction/${tx.id}`)}
                  accessibilityLabel={`${tx.direction === 'received' ? 'Received' : 'Sent'} ${tx.amount} ${tx.symbol}`}
                  leading={
                    <InitialsAvatar
                      initials={tx.direction === 'received' ? 'IN' : 'OUT'}
                      size={36}
                      tone="neutral"
                    />
                  }
                  trailing={
                    <Amount
                      value={`${tx.direction === 'received' ? '+' : '-'}${tx.amount}`}
                      symbol={tx.symbol}
                      direction={tx.direction === 'received' ? 'in' : 'out'}
                    />
                  }
                />
              ))}
            </View>
          )}
        </View>
      </View>

      <CopyToast message={toastMessage ?? ''} visible={toastVisible} />
    </ScrollView>
  );
}

/**
 * A single large action.
 *
 * Replaces the previous four-across grid of 1-up icon buttons. Two destinations
 * laid out as two full-width targets is easier to hit one-handed, and lets the
 * label sit next to the icon rather than beneath it, which removed the
 * two-line 10pt labels that were the smallest text in the app.
 */
function ActionTile({
  icon,
  label,
  hint,
  onPress,
  primary = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={[
        styles.tile,
        primary
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <Ionicons
        name={icon}
        size={19}
        color={primary ? colors.onPrimary : colors.textPrimary}
      />
      <Typography variant="titleSm" color={primary ? colors.onPrimary : colors.textPrimary}>
        {label}
      </Typography>
    </Touchable>
  );
}

function networkLabel(network: string): string {
  if (network === 'eth') return getEvmNetworkName('eth');
  if (network === 'bsc' || network === 'base' || network === 'polygon') {
    return getEvmNetworkName(network);
  }
  return CHAINS[network as keyof typeof CHAINS]?.name ?? network.toUpperCase();
}

function formatAmount(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  if (parsed === 0) return '0';
  if (Math.abs(parsed) < 0.000001) return parsed.toExponential(4);
  return parsed.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl },
  column: { paddingHorizontal: gutter, paddingTop: space.md },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  identityLeft: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  identityText: { flex: 1, gap: 4 },

  balanceBlock: { paddingTop: space.xl, paddingBottom: space.xl },

  warning: { marginTop: -space.sm },

  holdings: { paddingTop: space.lg, gap: space.md, paddingBottom: space.xl },

  holdingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },

  actions: { gap: space.md, paddingTop: space.lg, paddingBottom: space.xxl },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 56,
    borderRadius: 12,
    paddingHorizontal: space.xl,
  },

  section: { paddingTop: space.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  list: { marginHorizontal: -gutter, paddingHorizontal: gutter },
});
