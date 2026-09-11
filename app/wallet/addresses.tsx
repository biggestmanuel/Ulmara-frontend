import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useWalletStore } from '../../stores/walletStore';
import { useThemeStore, ThemeColors } from '../../lib/theme';

// Requires: npx expo install expo-clipboard (if not already present)

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum', bsc: 'BSC', base: 'Base', polygon: 'Polygon',
  sol: 'Solana', tron: 'TRON', ton: 'TON',
};

export default function WalletAddresses() {
  const { chain } = useLocalSearchParams<{ chain?: string }>();
  const addresses = useWalletStore((s) => s.addresses);
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const [copiedChain, setCopiedChain] = useState<string | null>(null);

  const entries = Object.entries(addresses).filter(
    ([chainId]) => !chain || chainId === chain
  );

  const handleCopy = async (chainId: string, address: string) => {
    await Clipboard.setStringAsync(address);
    setCopiedChain(chainId);
    setTimeout(() => setCopiedChain(null), 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Receiving Addresses</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Only send the matching asset on the matching network to each address below.
            Sending the wrong asset/network to an address can permanently lose funds.
          </Text>
        </View>

        {entries.length === 0 ? (
          <Text style={styles.emptyText}>No addresses generated yet</Text>
        ) : (
          entries.map(([chainId, address]) => (
            <View key={chainId} style={styles.card}>
              <Text style={styles.chainLabel}>{CHAIN_LABELS[chainId] ?? chainId}</Text>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                {address}
              </Text>
              <Pressable style={styles.copyBtn} onPress={() => handleCopy(chainId, address!)}>
                <Text style={styles.copyBtnText}>
                  {copiedChain === chainId ? 'Copied ✓' : 'Copy Address'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  back: { color: colors.textPrimary, fontSize: 28 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  warningBox: {
    backgroundColor: colors.primarySoft, borderRadius: 12, borderWidth: 1,
    borderColor: colors.primaryLight, padding: 14, marginBottom: 20,
  },
  warningText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 14,
  },
  chainLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  addressText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 12 },
  copyBtn: {
    backgroundColor: colors.surfaceElevated, borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  copyBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  });
}
