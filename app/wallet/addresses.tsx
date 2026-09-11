import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useWalletStore } from '../../stores/walletStore';

// Requires: npx expo install expo-clipboard (if not already present)

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum', bsc: 'BSC', base: 'Base', polygon: 'Polygon',
  sol: 'Solana', tron: 'TRON', ton: 'TON',
};

export default function WalletAddresses() {
  const { chain } = useLocalSearchParams<{ chain?: string }>();
  const addresses = useWalletStore((s) => s.addresses);
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  back: { color: '#FFFFFF', fontSize: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  warningBox: {
    backgroundColor: '#1A1610', borderRadius: 12, borderWidth: 1,
    borderColor: '#3A3020', padding: 14, marginBottom: 20,
  },
  warningText: { color: '#E8B84B', fontSize: 12, lineHeight: 17 },
  emptyText: { color: '#5C5C66', fontSize: 14, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: '#17171D', borderRadius: 14, borderWidth: 1, borderColor: '#26262E',
    padding: 16, marginBottom: 14,
  },
  chainLabel: { color: '#9A9AA5', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  addressText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  copyBtn: {
    backgroundColor: '#0B0B0F', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#26262E',
  },
  copyBtnText: { color: '#8C7AFF', fontSize: 13, fontWeight: '600' },
});
