import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import { AmountInput } from '../../components/send/AmountInput';
import { Button, Screen, Typography } from '../../components/ui';
import { useThemeStore } from '../../lib/theme';
import { isTokenSymbol, getTokenForChain } from '../../constants/tokens';
import { validateTokenAmount } from '../../lib/tokens/erc20';
import { useWalletStore } from '../../stores/walletStore';
import { getEvmProvider, nativeSymbolForChain } from '../../lib/chains/evmConfig';
import { wireToChainId } from '../../lib/api/routing';
import { getSigningAdapterByWire } from '../../lib/signing/chainAdapters';

/** Amount entry for an external-wallet transfer. */
export default function ExternalAmount() {
  const { colors } = useThemeStore();
  const params = useLocalSearchParams<{
    externalAddress: string;
    asset: string;
    network: string;
    networkName: string;
  }>();
  const balances = useWalletStore((s) => s.balances);
  const addresses = useWalletStore((s) => s.addresses);

  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);

  const asset = params.asset ?? '';
  const isToken = isTokenSymbol(asset);
  const chainId = wireToChainId(params.network ?? '');
  const decimals = isToken && chainId ? (getTokenForChain(asset, chainId)?.decimals ?? 6) : 18;

  const holding = balances.find((entry) => entry.symbol === asset && (!chainId || entry.chainId === chainId));

  /**
   * Live fee + native balance for the confirm screen.
   *
   * Runs once per address/asset. A failure is not fatal — the confirm screen
   * falls back to a native-transfer default — so it is swallowed here rather
   * than blocking the user on an RPC hiccup.
   */
  const loadFee = useCallback(async () => {
    if (!chainId) return;
    const adapter = getSigningAdapterByWire(params.network ?? '');
    if (!adapter || adapter.availability !== 'available') return;
    const from = addresses[chainId];
    if (!from) return;
    try {
      const provider = getEvmProvider(chainId);
      const [feeData, balance] = await Promise.all([
        provider.getFeeData(),
        provider.getBalance(from),
      ]);
      const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!gasPrice) return;
      const gasLimit = isToken ? 65_000n : 21_000n;
      setFee(`${formatUnits(gasPrice * gasLimit)} ${nativeSymbolForChain(chainId)}`);
      setNativeBalance(formatUnits(balance));
    } catch {
      // Fee stays unknown; the confirm screen handles that.
    }
  }, [chainId, addresses, isToken, params.network]);

  useEffect(() => {
    void loadFee();
  }, [loadFee]);

  const next = useCallback(() => {
    const trimmed = amount.trim();
    if (!trimmed) return setError('Enter an amount');
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return setError('Enter a valid amount');
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount greater than zero');

    if (isToken) {
      const invalid = validateTokenAmount(trimmed, decimals, asset);
      if (invalid) return setError(invalid);
    } else if ((trimmed.split('.')[1] ?? '').length > decimals) {
      return setError(`${asset} supports at most ${decimals} decimal places`);
    }

    if (holding && value > Number(holding.balance)) {
      return setError(`You only have ${holding.balance} ${asset} on ${holding.chainId.toUpperCase()}.`);
    }

    setError(null);
    router.push({
      pathname: '/send/confirm',
      params: {
        ...params,
        amount: trimmed,
        fee: fee ?? 'Fee calculated at send time',
        nativeBalance: nativeBalance ?? '',
        isToken: isToken ? '1' : '0',
      },
    });
  }, [amount, decimals, asset, isToken, holding, params, fee, nativeBalance]);

  return (
    <Screen testID="external-amount-screen">
      <View style={s.header}>
        <BackButton />
        <Typography variant="titleSm" style={s.headerTitle}>
          Amount
        </Typography>
      </View>

      <View style={s.body}>
        <Typography variant="body" color={colors.textMuted} style={s.caption}>
          Sending {asset} on {params.networkName}
        </Typography>

        <View style={s.amountBlock}>
          <AmountInput
            value={amount}
            onChangeText={(value) => {
              const nextValue = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
              setAmount(nextValue);
              setError(null);
            }}
            symbol={asset}
            error={error}
            maxLength={26}
          />
        </View>

        {holding ? (
          <View style={s.facts}>
            <FactRow
              label="Available"
              value={`${holding.balance} ${asset}${holding.chainId ? ` on ${holding.chainId.toUpperCase()}` : ''}`}
            />
            {fee ? <FactRow label="Network fee" value={fee} /> : null}
            {nativeBalance ? <FactRow label="Your native balance" value={nativeBalance} /> : null}
          </View>
        ) : null}

        {isToken ? (
          <View style={[s.notice, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Typography variant="caption" color={colors.primary} style={s.noticeText}>
              The fee above is paid in {params.networkName}&apos;s native coin. {asset} does not pay
              for itself, so you need a small native balance as well as the tokens you are sending.
            </Typography>
          </View>
        ) : null}
      </View>

      <View style={s.footer}>
        <Button label="Continue" onPress={next} accessibilityHint="Reviews this transfer before signing" />
      </View>
    </Screen>
  );
}

/** One label/value pair. Used for the balance and fee facts. */
function FactRow({ label, value }: { label: string; value: string }) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View style={s.factRow}>
      <Typography variant="body" color={colors.textSecondary}>
        {label}
      </Typography>
      <Typography variant="body" color={colors.textPrimary} numeric style={s.factValue}>
        {value}
      </Typography>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  headerTitle: { flex: 1 },
  body: { flex: 1, paddingTop: 16, gap: 16 },
  caption: {},
  amountBlock: { alignItems: 'center', paddingVertical: 24 },
  facts: { gap: 0 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
  },
  factValue: { flexShrink: 1, textAlign: 'right' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
  },
  noticeText: { flex: 1 },
  footer: { paddingTop: 16 },
});

function formatUnits(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
