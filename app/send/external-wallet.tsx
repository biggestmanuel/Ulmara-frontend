import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { NATIVE_ASSET_SYMBOLS, type NativeAssetSymbol } from '../../constants/chains';
import { ethers } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { validateExternalAddress, type SupportedTriVerifyChain } from '../../lib/validation/triverify';

const NETWORKS = ['ETH', 'BSC', 'TRON', 'SOL', 'TON', 'BASE', 'POLYGON', 'BTC'] as const;
type Network = (typeof NETWORKS)[number];

function looksValid(address: string, network: Network): boolean {
  if (network === 'SOL') {
    try { new PublicKey(address); return true; } catch { return false; }
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
  const styles = getStyles(colors);

  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<Network>('ETH');
  const [asset, setAsset] = useState<NativeAssetSymbol>('ETH');
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    if (!address.trim()) return setError('Enter a wallet address');
    const normalizedAddress = address.trim();
    if (!looksValid(normalizedAddress, network)) return setError(`This doesn't look like a valid ${network} address`);
    if (network === 'ETH' || network === 'BSC' || network === 'BASE' || network === 'POLYGON' ||
      network === 'SOL' || network === 'TRON' || network === 'TON' || network === 'BTC') {
      try {
        const result = await validateExternalAddress(
          normalizedAddress,
          network as SupportedTriVerifyChain,
        );
        if (!result.formatValid || result.exists === false) {
          return setError(`The ${network} address could not be validated.`);
        }
      } catch {
        return setError('Address validation is temporarily unavailable. Try again later.');
      }
    }
    router.push({
      pathname: '/send/external-amount',
      params: {
        externalAddress: normalizedAddress,
        asset,
        network,
        networkName: network === 'POLYGON' ? 'Polygon' : network,
        fee: 'Fee calculated by network',
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>External Wallet</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Sending to the wrong network or a mistyped address can result in permanent loss of funds.
            </Text>
          </View>

          <Text style={styles.label}>Network</Text>
          <View style={styles.chipRow}>
            {NETWORKS.map((n) => (
              <Pressable
                key={n}
                style={[styles.chip, network === n && styles.chipActive]}
                onPress={() => setNetwork(n)}
              >
                <Text style={[styles.chipText, network === n && styles.chipTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 20 }]}>Wallet Address</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder={`Paste ${network} address`}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            multiline
            value={address}
            onChangeText={setAddress}
          />

          <Text style={[styles.label, { marginTop: 20 }]}>Asset</Text>
          <View style={styles.chipRow}>
            {NATIVE_ASSET_SYMBOLS.map((a) => (
              <Pressable
                key={a}
                style={[styles.chip, asset === a && styles.chipActive]}
                onPress={() => setAsset(a)}
              >
                <Text style={[styles.chipText, asset === a && styles.chipTextActive]}>{a}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleContinue}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    },
    back: { color: colors.textPrimary, fontSize: 28 },
    headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
    body: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
    warningBox: {
      backgroundColor: `${colors.warning}1A`, borderRadius: 12, borderWidth: 1,
      borderColor: `${colors.warning}40`, padding: 14, marginBottom: 20,
    },
    warningText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
    label: { fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: '500' },
    input: {
      backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      color: colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: colors.border,
    },
    inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: '#FFFFFF' },
    error: { color: colors.error, fontSize: 13, marginTop: 14 },
    footer: { paddingHorizontal: 20, paddingBottom: 32 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center', height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  });
}
