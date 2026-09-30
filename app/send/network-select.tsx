import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Badge,
  Button,
  EmptyState,
  ListRow,
  LoadingSpinner,
  Screen,
  SectionLabel,
  Touchable,
  Typography,
} from '../../components/ui';
import { radius, useThemeStore } from '../../lib/theme';
import {
  buildRouteQuotes,
  pickRecommended,
  type RecipientWallet,
  type RouteQuote,
} from '../../lib/api/routing';
import { useWalletStore } from '../../stores/walletStore';
import { isTokenSymbol } from '../../constants/tokens';

/**
 * Network picker.
 *
 * Quotes come from `buildRouteQuotes`, which prices each chain against its own
 * public RPC. The previous `POST /api/routing/quotes` call hit a route the
 * backend does not define, so this screen used to be unable to produce a single
 * quote — and with Continue disabled behind one, the whole Ulmara-to-Ulmara
 * transfer flow was unreachable. See lib/api/routing.ts.
 */
export default function NetworkSelect() {
  const { colors } = useThemeStore();

  const params = useLocalSearchParams<{
    accountId: string;
    recipientName: string;
    asset: string;
    amount: string;
    wallets?: string;
  }>();

  const addresses = useWalletStore((s) => s.addresses);

  const [options, setOptions] = useState<RouteQuote[]>([]);
  const [recommended, setRecommended] = useState<RouteQuote | null>(null);
  const [selected, setSelected] = useState<RouteQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipientWallets = useMemo<RecipientWallet[]>(() => {
    if (!params.wallets) return [];
    try {
      const parsed: unknown = JSON.parse(params.wallets);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (wallet): wallet is RecipientWallet =>
          typeof wallet === 'object' &&
          wallet !== null &&
          typeof (wallet as RecipientWallet).chain === 'string' &&
          typeof (wallet as RecipientWallet).address === 'string'
      );
    } catch {
      return [];
    }
  }, [params.wallets]);

  useEffect(() => {
    if (!params.accountId || !params.asset || !params.amount) return;
    if (recipientWallets.length === 0) {
      setError('We could not read the recipient\'s wallet details. Go back and try again.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    buildRouteQuotes({
      recipientWallets,
      asset: params.asset,
      amount: params.amount,
      senderAddresses: addresses,
    })
      .then((quotes) => {
        if (cancelled) return;
        setOptions(quotes);
        const best = pickRecommended(quotes);
        setRecommended(best);
        setSelected(best);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Live network quotes are unavailable. Try again later.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.accountId, params.asset, params.amount, recipientWallets, addresses]);

  const handleContinue = useCallback(() => {
    if (!selected || !selected.available) {
      setError('Select an available network before continuing.');
      return;
    }
    const targetAddress =
      selected.recipientAddress ??
      recipientWallets.find((wallet) => wallet.chain.toUpperCase() === selected.network)?.address;
    if (!targetAddress) {
      setError(`The recipient has no ${selected.label} wallet.`);
      return;
    }
    setError(null);
    router.push({
      pathname: '/send/confirm',
      params: {
        ...params,
        targetAddress,
        network: selected.network,
        networkName: selected.label,
        fee: `${selected.estimatedFee} ${selected.nativeSymbol ?? ''}`.trim(),
        isToken: selected.isToken ? '1' : '0',
        nativeBalance: selected.nativeBalance ?? '',
        insufficientGas: selected.insufficientGas ? '1' : '0',
      },
    });
  }, [selected, recipientWallets, params]);

  const isToken = isTokenSymbol(params.asset ?? '');

  return (
    <Screen testID="network-select-screen">
      <View style={s.header}>
        <BackButton />
        <Typography variant="titleSm" style={s.headerTitle}>
          Select network
        </Typography>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isToken ? (
          <View style={[s.notice, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Typography variant="caption" color={colors.primary} style={s.noticeText}>
              {params.asset} is an ERC-20 token. The network fee below is paid in the chain&apos;s
              own native coin, not in {params.asset}.
            </Typography>
          </View>
        ) : null}

        {loading ? (
          <View style={s.center}>
            <LoadingSpinner size="large" label="Pricing networks" />
          </View>
        ) : !recommended ? (
          <EmptyState
            icon="alert-circle-outline"
            title="No route is available"
            body={
              options.find((option) => option.unavailableReason)?.unavailableReason ??
              'Neither of you has a compatible wallet, or this network is not supported yet.'
            }
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        ) : !advanced ? (
          <>
            <SectionLabel>RECOMMENDED</SectionLabel>
            <ListRow
              title={recommended.label}
              subtitle={describeQuote(recommended)}
              showSeparator={false}
              onPress={handleContinue}
              accessibilityLabel={`Continue on ${recommended.label}. ${describeQuote(recommended)}`}
              accessibilityHint="Uses the cheapest available network"
              leading={
                <View style={[s.netIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="flash-outline" size={17} color={colors.primary} />
                </View>
              }
              trailing={<Badge label="Best" tone="primary" icon="flash" />}
            />

            {recommended.insufficientGas ? (
              <View style={[s.gas, { backgroundColor: colors.warningTint }]}>
                <Ionicons name="warning-outline" size={15} color={colors.warning} />
                <Typography variant="caption" color={colors.warning} style={s.noticeText}>
                  Not enough {recommended.nativeSymbol} to cover the network fee.
                </Typography>
              </View>
            ) : null}

            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Choose a different network"
              accessibilityState={{ expanded: advanced }}
              onPress={() => setAdvanced(true)}
              pressScale={0.98}
              style={s.advanced}
            >
              <Ionicons name="list-outline" size={16} color={colors.primary} />
              <Typography variant="label" color={colors.primary}>
                Choose a different network
              </Typography>
            </Touchable>
          </>
        ) : (
          <>
            <SectionLabel>AVAILABLE NETWORKS</SectionLabel>
            {options.map((option, index) => (
              <NetworkOption
                key={option.network}
                quote={option}
                isSelected={selected?.network === option.network}
                isBest={option.network === recommended.network}
                showSeparator={index < options.length - 1}
                onSelect={setSelected}
              />
            ))}

            {error ? (
              <Typography
                variant="label"
                color={colors.error}
                style={s.error}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {error}
              </Typography>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={s.footer}>
        <Button
          label="Continue"
          onPress={handleContinue}
          disabled={!selected?.available || loading}
          accessibilityHint="Reviews this transfer on the selected network"
        />
      </View>
    </Screen>
  );
}

/** One line describing a quote: fee, settlement time, and whether it is exact. */
function describeQuote(quote: RouteQuote): string {
  if (!quote.available) return quote.unavailableReason ?? 'Unavailable';
  const base = `Fee ${quote.estimatedFee} ${quote.nativeSymbol} · ~${quote.estimatedSeconds}s`;
  return quote.approximateFee ? `${base} · estimate` : base;
}

/**
 * One selectable network.
 *
 * ## What changed
 *
 * The row had `accessibilityRole="radio"` and `accessibilityState` but **no
 * `accessibilityLabel`**, so a screen reader announced only "radio button" with
 * no indication of which network it was. The label now names the network, its
 * fee, its settlement time, and its availability — the fee is the whole reason
 * this screen exists, so it belongs in the accessible name rather than only in
 * the visual layout.
 */
const NetworkOption = memo(function NetworkOption({
  quote,
  isSelected,
  isBest,
  showSeparator,
  onSelect,
}: {
  quote: RouteQuote;
  isSelected: boolean;
  isBest: boolean;
  showSeparator: boolean;
  onSelect: (quote: RouteQuote) => void;
}) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <ListRow
      title={quote.label}
      subtitle={describeQuote(quote)}
      showSeparator={showSeparator}
      onPress={quote.available ? () => onSelect(quote) : undefined}
      disabled={!quote.available}
      accessibilityLabel={`${quote.label}. ${describeQuote(quote)}`}
      accessibilityState={{
        selected: isSelected,
        disabled: !quote.available,
        checked: isSelected,
      }}
      aria-selected={isSelected}
      leading={
        <View
          style={[
            s.netIcon,
            { backgroundColor: quote.available ? colors.surfaceElevated : colors.background },
          ]}
        >
          <Ionicons
            name="git-network-outline"
            size={17}
            color={quote.available ? colors.textSecondary : colors.textMuted}
          />
        </View>
      }
      trailing={
        isBest ? (
          <Badge label="Best" tone="neutral" icon="flash" />
        ) : quote.available ? (
          <Ionicons
            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={isSelected ? colors.primary : colors.textMuted}
          />
        ) : null
      }
    />
  );
});

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  headerTitle: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingTop: 16, paddingBottom: 24, gap: 12 },
  center: { alignItems: 'center', paddingTop: 48 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
  },
  noticeText: { flex: 1 },
  gas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
  },
  netIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advanced: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  error: { marginTop: 4 },
  footer: { paddingTop: 16 },
});
