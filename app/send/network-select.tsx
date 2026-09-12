import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';

// TODO: replace with lib/routing/recommendedNetwork.ts real fee/speed lookup
type NetworkOption = { id: string; name: string; fee: string; speed: string };

const NETWORKS_BY_ASSET: Record<string, NetworkOption[]> = {
  USDT: [
    { id: 'TON', name: 'TON', fee: '~$0.02', speed: '~5s' },
    { id: 'BSC', name: 'BNB Smart Chain', fee: '~$0.15', speed: '~3s' },
    { id: 'TRON', name: 'TRON', fee: '~$1.00', speed: '~3s' },
    { id: 'ETH', name: 'Ethereum', fee: '~$3.50', speed: '~15s' },
  ],
  BTC: [{ id: 'BTC', name: 'Bitcoin', fee: '~$1.20', speed: '~10min' }],
  ETH: [
    { id: 'ETH', name: 'Ethereum', fee: '~$2.80', speed: '~15s' },
    { id: 'BASE', name: 'Base', fee: '~$0.05', speed: '~2s' },
  ],
  SOL: [{ id: 'SOL', name: 'Solana', fee: '~$0.001', speed: '~1s' }],
  TON: [{ id: 'TON', name: 'TON', fee: '~$0.02', speed: '~5s' }],
};

function pickRecommended(options: NetworkOption[]): NetworkOption {
  // cheapest fee wins the recommendation
  return [...options].sort((a, b) => parseFloat(a.fee.replace(/[^0-9.]/g, '')) - parseFloat(b.fee.replace(/[^0-9.]/g, '')))[0];
}

export default function NetworkSelect() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  const params = useLocalSearchParams<{
    accountId: string; recipientName: string; asset: string; amount: string; wallets?: string;
  }>();

  const options = NETWORKS_BY_ASSET[params.asset] ?? NETWORKS_BY_ASSET.USDT;
  const recommended = useMemo(() => pickRecommended(options), [options]);
  const [selected, setSelected] = useState<NetworkOption>(recommended);
  const [advanced, setAdvanced] = useState(false);

  const handleContinue = () => {
    const wallets = params.wallets ? JSON.parse(params.wallets) as { chain: string; address: string }[] : [];
    const targetAddress = wallets.find((wallet) => wallet.chain === selected.id)?.address;
    if (!targetAddress) return;
    router.push({
      pathname: '/send/confirm',
      params: { ...params, targetAddress, network: selected.id, networkName: selected.name, fee: selected.fee },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Select Network</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        {!advanced ? (
          <>
            <Text style={styles.sectionLabel}>Recommended</Text>
            <View style={styles.recommendedCard}>
              <View style={styles.recommendedRow}>
                <Text style={styles.recommendedName}>{recommended.name}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Best</Text>
                </View>
              </View>
              <Text style={styles.recommendedMeta}>
                Fee {recommended.fee} · {recommended.speed}
              </Text>
            </View>

            <Pressable style={styles.advancedLink} onPress={() => setAdvanced(true)}>
              <Text style={styles.advancedLinkText}>Choose a different network</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Available Networks</Text>
            {options.map((opt) => (
              <Pressable
                key={opt.id}
                style={[styles.networkRow, selected.id === opt.id && styles.networkRowActive]}
                onPress={() => setSelected(opt)}
              >
                <View>
                  <Text style={styles.networkName}>{opt.name}</Text>
                  <Text style={styles.networkMeta}>Fee {opt.fee} · {opt.speed}</Text>
                </View>
                {opt.id === recommended.id && (
                  <View style={styles.badgeSmall}>
                    <Text style={styles.badgeText}>Best</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={handleContinue}>
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      </View>
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
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  sectionLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginBottom: 10 },
  recommendedCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.primary,
    padding: 18,
  },
  recommendedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recommendedName: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  recommendedMeta: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  badge: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeSmall: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  advancedLink: { marginTop: 20, alignItems: 'center' },
  advancedLinkText: { color: colors.primaryHover, fontSize: 14, fontWeight: '600' },
  networkRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 10,
  },
  networkRowActive: { borderColor: colors.primary },
  networkName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  networkMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  footer: { paddingHorizontal: 20, paddingBottom: 32 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', height: 54,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
}
