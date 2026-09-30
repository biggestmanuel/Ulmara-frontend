import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Button,
  Input,
  Screen,
  SectionLabel,
  Touchable,
  Typography,
} from '../../components/ui';
import { useThemeStore } from '../../lib/theme';
import { NATIVE_ASSET_SYMBOLS } from '../../constants/chains';
import { getConfiguredTokens } from '../../constants/tokens';
import { getSigningAdapterByWire } from '../../lib/signing/chainAdapters';
import { getEvmNetworkName } from '../../lib/chains/evmConfig';
import { validateExternalAddress, type SupportedTriVerifyChain } from '../../lib/validation/triverify';

const NETWORKS = ['ETH', 'BSC', 'TRON', 'SOL', 'TON', 'BASE', 'POLYGON', 'BTC'] as const;
type Network = (typeof NETWORKS)[number];

const CHAIN_ID_BY_WIRE: Record<string, Parameters<typeof getConfiguredTokens>[0]> = {
  ETH: 'eth',
  BSC: 'bsc',
  BASE: 'base',
  POLYGON: 'polygon',
};

function looksValid(address: string, network: Network): boolean {
  if (network === 'SOL') {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
  if (network === 'TON') return address.length >= 40 && address.length <= 70;
  if (network === 'TRON') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (network === 'BTC') {
    return /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
  }
  return ethers.isAddress(address);
}

export default function ExternalWallet() {
  const { colors } = useThemeStore();
  const params = useLocalSearchParams<{ asset?: string }>();

  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<Network>('ETH');
  const [asset, setAsset] = useState<string>(params.asset ?? 'ETH');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  /**
   * Assets offered for the selected network: the chain's native coin (only if
   * this build can sign for it) plus any ERC-20 configured there. Selecting a
   * network that cannot carry the current asset falls back to that network's
   * native coin rather than leaving an impossible selection in place.
   */
  const availableAssets = useMemo(() => {
    const chainId = CHAIN_ID_BY_WIRE[network];
    const adapter = getSigningAdapterByWire(network);
    const list: { symbol: string; isToken: boolean }[] = [];

    const nativeSymbol =
      network === 'ETH' || network === 'BASE' ? 'ETH' : network === 'BSC' ? 'BNB' : network === 'POLYGON' ? 'POL' : network;
    if (adapter?.availability === 'available' && NATIVE_ASSET_SYMBOLS.includes(nativeSymbol as never)) {
      list.push({ symbol: nativeSymbol, isToken: false });
    }
    if (chainId) {
      for (const token of getConfiguredTokens(chainId)) {
        list.push({ symbol: token.symbol, isToken: true });
      }
    }
    return list;
  }, [network]);

  const currentIsToken = useMemo(
    () => availableAssets.some((entry) => entry.symbol === asset && entry.isToken),
    [availableAssets, asset]
  );

  const handleSelectNetwork = useCallback((next: Network) => {
    setNetwork(next);
    // Re-validate the selection: the asset must exist on the new network.
    setAsset((current) => {
      const chainId = CHAIN_ID_BY_WIRE[next];
      const stillValid =
        (current === 'ETH' && (next === 'ETH' || next === 'BASE')) ||
        (current === 'BNB' && next === 'BSC') ||
        (current === 'POL' && next === 'POLYGON') ||
        (chainId ? getConfiguredTokens(chainId).some((t) => t.symbol === current) : false);
      if (stillValid) return current;
      if (next === 'ETH' || next === 'BASE') return 'ETH';
      if (next === 'BSC') return 'BNB';
      if (next === 'POLYGON') return 'POL';
      return current;
    });
  }, []);

  const handleContinue = useCallback(async () => {
    setError(null);
    if (!address.trim()) return setError('Enter a wallet address');
    const normalizedAddress = address.trim();

    if (!looksValid(normalizedAddress, network)) {
      return setError(`This doesn't look like a valid ${network} address`);
    }

    setValidating(true);
    try {
      // TriVerify (via the authenticated backend proxy) proves the address is
      // real on the target chain and blocks a cross-network paste — this runs
      // *before* any signing, so a wrong-network address never reaches a key.
      const result = await validateExternalAddress(
        normalizedAddress,
        network as SupportedTriVerifyChain
      );
      if (!result.formatValid || result.exists === false) {
        return setError(
          `The ${network} address could not be validated on ${network}. Check for a wrong-network paste.`
        );
      }
    } catch {
      return setError('Address validation is temporarily unavailable. Try again later.');
    } finally {
      setValidating(false);
    }

    if (currentIsToken) {
      // Server-side, not a client preference: `external/prepare` rejects any
      // non-native asset and `submit` rejects any signed payload with a
      // `data` field, which is every ERC-20 transfer. Refusing here saves the
      // user a PIN entry for a transfer that cannot succeed.
      setError(
        `${asset} transfers to external wallets are not supported yet. The network has to accept ` +
          `token transfers first — sending ${asset} to another Ulmara user works today.`
      );
      return;
    }

    router.push({
      pathname: '/send/external-amount',
      params: {
        externalAddress: normalizedAddress,
        asset,
        network,
        networkName: getEvmNetworkName(CHAIN_ID_BY_WIRE[network] ?? 'eth') || network,
      },
    });
  }, [address, network, asset, currentIsToken]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="external-wallet-screen">
        <View style={s.header}>
          <BackButton />
          <Typography variant="titleSm" style={s.headerTitle}>
            External wallet
          </Typography>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* The most consequential warning in the app, so it is stated before
              anything is typed rather than discovered at the end. */}
          <View style={[s.warning, { backgroundColor: colors.errorTint }]}>
            <Ionicons name="warning" size={17} color={colors.error} />
            <Typography variant="caption" color={colors.error} style={s.warningText}>
              Sending to the wrong network, or to a mistyped address, can mean losing the funds
              permanently. Nobody can reverse it.
            </Typography>
          </View>

          <View style={s.group}>
            <SectionLabel>NETWORK</SectionLabel>
            <View style={s.chipRow}>
              {NETWORKS.map((option) => {
                const active = network === option;
                return (
                  <Touchable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityLabel={`${option} network`}
                    accessibilityState={{ selected: active, checked: active }}
                    aria-selected={active}
                    onPress={() => handleSelectNetwork(option)}
                    pressScale={0.97}
                    style={[
                      s.chip,
                      {
                        backgroundColor: active ? colors.primaryLight : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Typography variant="label" color={active ? colors.primary : colors.textMuted}>
                      {option}
                    </Typography>
                  </Touchable>
                );
              })}
            </View>
          </View>

          <View style={s.group}>
            <Input
              label="Wallet address"
              placeholder={`Paste the ${network} address`}
              value={address}
              onChangeText={(value) => {
                setAddress(value);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              // Named after the network, because an address field with no name
              // is the single most error-prone input in a cross-chain transfer.
              accessibilityLabel={`${network} wallet address`}
              accessibilityHint="Paste the destination address exactly as it appears"
            />
          </View>

          <View style={s.group}>
            <SectionLabel>ASSET</SectionLabel>
            {availableAssets.length === 0 ? (
              <Typography variant="body" color={colors.textMuted} style={s.unavailable}>
                Sending on {network} is not available in this build yet.
              </Typography>
            ) : (
              <View style={s.chipRow}>
                {availableAssets.map((entry) => {
                  const active = asset === entry.symbol;
                  return (
                    <Touchable
                      key={entry.symbol}
                      accessibilityRole="radio"
                      accessibilityLabel={
                        entry.isToken ? `${entry.symbol}, ERC-20 token` : `${entry.symbol}, native coin`
                      }
                      accessibilityState={{ selected: active, checked: active }}
                      aria-selected={active}
                      onPress={() => setAsset(entry.symbol)}
                      pressScale={0.97}
                      style={[
                        s.chip,
                        {
                          backgroundColor: active ? colors.primaryLight : colors.surface,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Typography variant="label" color={active ? colors.primary : colors.textMuted}>
                        {entry.symbol}
                      </Typography>
                      {entry.isToken ? (
                        <Typography
                          variant="micro"
                          color={active ? colors.primary : colors.textMuted}
                        >
                          ERC-20
                        </Typography>
                      ) : null}
                    </Touchable>
                  );
                })}
              </View>
            )}
          </View>

          {currentIsToken ? (
            <View style={[s.notice, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <Typography variant="caption" color={colors.primary} style={s.noticeText}>
                {asset} is an ERC-20 token. Token transfers to external wallets are not supported
                yet, and the network fee would be paid in {network}&apos;s native coin — not in{' '}
                {asset}.
              </Typography>
            </View>
          ) : null}

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
        </ScrollView>

        <View style={s.footer}>
          <Button
            label={validating ? 'Validating address…' : 'Continue'}
            onPress={() => void handleContinue()}
            loading={validating}
            disabled={validating || availableAssets.length === 0}
            accessibilityHint="Checks the address against the selected network before you pay a fee"
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  headerTitle: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingTop: 16, paddingBottom: 24, gap: 16 },
  group: { gap: 8 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
  },
  warningText: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  unavailable: { paddingVertical: 8 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
  },
  noticeText: { flex: 1 },
  error: { marginTop: 4 },
  footer: { paddingTop: 16 },
});
