import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';

import {
  Badge,
  Button,
  CopyToast,
  EmptyState,
  ListRow,
  LoadingSpinner,
  Screen,
  SegmentedControl,
  Sheet,
  Touchable,
  Typography,
  useCopyToast,
} from '../../components/ui';
import { useWalletStore, type AssetBalance } from '../../stores/walletStore';
import { CHAINS } from '../../constants/chains';
import { getEvmNetworkName, nativeSymbolForChain } from '../../lib/chains/evmConfig';
import { gutter, radius, space, useThemeStore } from '../../lib/theme';

type Filter = 'all' | 'native' | 'token';

/**
 * Balances.
 *
 * ## What changed
 *
 * - The three filter chips become a `SegmentedControl`, which reports itself as
 *   a tab list with `selected` per option. The previous chips used
 *   `accessibilityRole="radio"` inside no radio group, which is a mismatched
 *   role and gave a screen reader no way to know how many options there were.
 * - The asset detail modal becomes a `Sheet`: it gains a labelled close control
 *   and a focus-trapping container, and the previous close control — a bare
 *   `lucide-react-native` `X` inside a `Pressable` whose only label was
 *   "Close" but whose role was unstated — is now a proper `IconButton`.
 * - The copy control for the deposit address gains a name ("Copy <network>
 *   address"), because the old one only said "button".
 * - Asset rows are `ListRow`s, so the amount is right-aligned with tabular
 *   figures and the row has a hairline rather than sitting in a card.
 */
export default function BalancesScreen() {
  const colors = useThemeStore((state) => state.colors);
  const [selectedAsset, setSelectedAsset] = useState<AssetBalance | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { copyToClipboard, message: toastMessage, visible: toastVisible } = useCopyToast();

  const balances = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);
  const warning = useWalletStore((s) => s.warning);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);

  const filtered = useMemo(() => {
    if (filter === 'all') return balances;
    return balances.filter((entry) => (filter === 'token' ? entry.isToken : !entry.isToken));
  }, [balances, filter]);

  const networkCount = useMemo(
    () => new Set(balances.map((entry) => entry.chainId)).size,
    [balances]
  );

  const renderItem = useCallback(
    ({ item }: { item: AssetBalance }) => (
      <AssetRow asset={item} onPress={setSelectedAsset} />
    ),
    []
  );

  const keyExtractor = useCallback((item: AssetBalance) => item.id, []);

  return (
    <>
      <Screen scroll={false} contentStyle={styles.screen} testID="balances-screen">
        <View style={styles.headings}>
          <Typography variant="title">Balances</Typography>
          <Typography variant="body" color={colors.textMuted} style={styles.subtitle}>
            {balances.length} asset{balances.length === 1 ? '' : 's'} across {networkCount} network
            {networkCount === 1 ? '' : 's'}
          </Typography>
        </View>

        <SegmentedControl<Filter>
          accessibilityLabel="Asset type"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'native', label: 'Native' },
            { value: 'token', label: 'Tokens' },
          ]}
        />

        {warning ? (
          <View style={[styles.warning, { backgroundColor: colors.warningTint }]}>
            <Ionicons name="warning-outline" size={15} color={colors.warning} />
            <Typography variant="caption" color={colors.warning} style={styles.warningText}>
              {warning}
            </Typography>
          </View>
        ) : null}

        <FlashList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          drawDistance={300}
          contentContainerStyle={styles.list}
          onRefresh={refreshBalances}
          refreshing={isLoadingBalances}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            isLoadingBalances ? (
              <LoadingSpinner size="large" label="Reading on-chain balances" />
            ) : (
              <EmptyState
                icon="wallet-outline"
                title={filter === 'token' ? 'No tokens' : 'No balances yet'}
                body={
                  filter === 'token'
                    ? 'No ERC-20 tokens are configured for your networks.'
                    : 'Pull down to refresh, or receive some crypto to get started.'
                }
                actionLabel={filter === 'token' ? undefined : 'Receive'}
                onAction={filter === 'token' ? undefined : () => router.push('/receive')}
              />
            )
          }
        />
      </Screen>

      <Sheet
        visible={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        title={selectedAsset ? `${selectedAsset.symbol} on ${networkName(selectedAsset)}` : ''}
        footer={
          selectedAsset ? (
            <>
              <Button
                label="Receive"
                onPress={() => {
                  setSelectedAsset(null);
                  router.push('/receive');
                }}
              />
              <Button
                label={`Send ${selectedAsset.symbol}`}
                variant="secondary"
                onPress={() => {
                  const asset = selectedAsset.symbol;
                  setSelectedAsset(null);
                  router.push({ pathname: '/send', params: { asset } });
                }}
              />
            </>
          ) : null
        }
      >
        {selectedAsset ? (
          <>
            <View style={styles.detailTop}>
              <Typography variant="label" color={colors.textMuted}>
                Available balance
              </Typography>
              <Typography variant="amount" numeric style={styles.detailAmount}>
                {formatBalance(selectedAsset.balance)} {selectedAsset.symbol}
              </Typography>
              <View style={styles.badgeRow}>
                <Badge
                  label={selectedAsset.isToken ? 'ERC-20 token' : 'Native coin'}
                  tone={selectedAsset.isToken ? 'primary' : 'neutral'}
                />
                <Badge label={networkName(selectedAsset)} tone="neutral" />
              </View>
            </View>

            {selectedAsset.isToken ? (
              <Typography variant="caption" color={colors.textMuted} style={styles.tokenNote}>
                Network fees for a token transfer are paid in{' '}
                {nativeSymbolForChain(selectedAsset.chainId)}, not in {selectedAsset.symbol}.
              </Typography>
            ) : null}

            <View style={styles.addressBlock}>
              <Typography variant="label" color={colors.textMuted}>
                {selectedAsset.isToken ? 'Token deposit address' : 'Deposit address'}
              </Typography>
              <Typography variant="code" style={styles.address}>
                {selectedAsset.address || 'Not available'}
              </Typography>              <Touchable
                accessibilityRole="button"
                accessibilityLabel={`Copy ${networkName(selectedAsset)} address`}
                accessibilityHint="Copies the address to your clipboard"
                onPress={() =>
                  copyToClipboard(
                    selectedAsset.address ?? '',
                    `${networkName(selectedAsset)} address copied`
                  )
                }
                disabled={!selectedAsset.address}
                pressScale={0.97}
                style={styles.copyRow}
              >
                <Ionicons name="copy-outline" size={15} color={colors.primary} />
                <Typography variant="label" color={colors.primary}>
                  Copy address
                </Typography>
              </Touchable>
            </View>
          </>
        ) : null}
      </Sheet>

      <CopyToast message={toastMessage ?? ''} visible={toastVisible} />
    </>
  );
}

/** Memoised so a balances refresh does not re-render every row. */
const AssetRow = memo(function AssetRow({
  asset,
  onPress,
}: {
  asset: AssetBalance;
  onPress: (asset: AssetBalance) => void;
}) {
  const colors = useThemeStore((state) => state.colors);
  const network = networkName(asset);

  return (
    <ListRow
      title={asset.symbol}
      subtitle={`${network}${asset.isToken ? ' · ERC-20' : ''}`}
      onPress={() => onPress(asset)}
      accessibilityLabel={`${asset.symbol} on ${network}, ${formatBalance(asset.balance)} ${asset.symbol}`}
      accessibilityHint="Shows the deposit address and send options"
      showSeparator={false}
      leading={
        <View style={[styles.assetIcon, { backgroundColor: colors.primaryLight }]}>
          <Typography variant="label" color={colors.primary}>
            {asset.symbol.slice(0, 3)}
          </Typography>
        </View>
      }
      trailing={
        <Typography variant="amountSm" numeric color={asset.isToken ? colors.textSecondary : colors.textPrimary}>
          {formatBalance(asset.balance)}
        </Typography>
      }
    />
  );
});

function networkName(asset: AssetBalance): string {
  const id = asset.chainId;
  if (id === 'eth') return getEvmNetworkName('eth');
  if (id === 'bsc' || id === 'base' || id === 'polygon') return getEvmNetworkName(id);
  return CHAINS[id as keyof typeof CHAINS]?.name ?? id.toUpperCase();
}

function formatBalance(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  if (parsed === 0) return '0';
  if (Math.abs(parsed) < 0.000001) return parsed.toExponential(4);
  return parsed
    .toFixed(8)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
    .replace(/(\.\d{1,4})\d+$/, '$1');
}

const styles = StyleSheet.create({
  screen: { paddingTop: space.md },
  headings: { marginBottom: space.lg },
  subtitle: { marginTop: space.xs },

  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.chip,
    marginTop: space.lg,
  },
  warningText: { flex: 1 },

  list: { paddingTop: space.lg, paddingBottom: space.xxxl, marginHorizontal: -gutter, paddingHorizontal: gutter },

  assetIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailTop: { gap: space.xs },
  detailAmount: { fontSize: 34, lineHeight: 40 },
  badgeRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' },
  tokenNote: { marginTop: space.lg },

  addressBlock: { marginTop: space.xl, gap: space.sm },
  address: { lineHeight: 20 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
  },
});
