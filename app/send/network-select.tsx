import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { fetchRouteQuotes, type RouteQuote } from '../../lib/api/routing';

function pickRecommended(options: RouteQuote[]): RouteQuote | null {
  return options.filter((option) => option.available).sort((a, b) => a.estimatedFeeUsd - b.estimatedFeeUsd)[0] ?? null;
}

export default function NetworkSelect() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  const params = useLocalSearchParams<{
    accountId: string; recipientName: string; asset: string; amount: string; wallets?: string;
  }>();

  const [options, setOptions] = useState<RouteQuote[]>([]);
  const [recommended, setRecommended] = useState<RouteQuote | null>(null);
  const [selected, setSelected] = useState<RouteQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!params.accountId || !params.asset || !params.amount) return;
    fetchRouteQuotes({ asset: params.asset, amount: params.amount, recipientAccountId: params.accountId })
      .then((quotes) => {
        setOptions(quotes);
        const best = pickRecommended(quotes);
        setRecommended(best);
        setSelected(best);
      })
      .catch(() => setError('Live network quotes are unavailable. Try again later.'))
      .finally(() => setLoading(false));
  }, [params.accountId, params.asset, params.amount]);

  const handleContinue = () => {
    if (!selected || !selected.available) {
      setError('Select an available network quote before continuing.');
      return;
    }
    let wallets: { chain: string; address: string }[] = [];
    try {
      const parsed: unknown = params.wallets ? JSON.parse(params.wallets) : [];
      if (Array.isArray(parsed)) {
        wallets = parsed.filter(
          (wallet): wallet is { chain: string; address: string } =>
            typeof wallet === 'object' && wallet !== null &&
            typeof (wallet as { chain?: unknown }).chain === 'string' &&
            typeof (wallet as { address?: unknown }).address === 'string'
        );
      }
    } catch {
      setError('Could not read the recipient wallet details. Go back and try again.');
      return;
    }
    const targetAddress = wallets.find((wallet) => wallet.chain.toLowerCase() === selected.network)?.address;
    if (!targetAddress) {
      setError(`The recipient has no ${selected.label} wallet.`);
      return;
    }
    setError(null);
    router.push({
      pathname: '/send/confirm',
      params: { ...params, targetAddress, network: selected.network, networkName: selected.label, fee: `$${selected.estimatedFeeUsd.toFixed(2)}` },
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
        {loading ? <Text style={styles.error}>Getting live network quotes…</Text> : !recommended ? (
          <Text style={styles.error}>No route is available for this asset and recipient.</Text>
        ) : !advanced ? (
          <>
            <Text style={styles.sectionLabel}>Recommended</Text>
            <View style={styles.recommendedCard}>
              <View style={styles.recommendedRow}>
                <Text style={styles.recommendedName}>{recommended.label}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Best</Text>
                </View>
              </View>
              <Text style={styles.recommendedMeta}>
                Fee ${recommended.estimatedFeeUsd.toFixed(2)} · ~{recommended.estimatedSeconds}s
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
                key={opt.network}
                style={[styles.networkRow, selected?.network === opt.network && styles.networkRowActive, !opt.available && styles.networkRowDisabled]}
                onPress={() => setSelected(opt)}
                disabled={!opt.available}
              >
                <View>
                  <Text style={styles.networkName}>{opt.label}</Text>
                  <Text style={styles.networkMeta}>{opt.available ? `Fee $${opt.estimatedFeeUsd.toFixed(2)} · ~${opt.estimatedSeconds}s` : opt.unavailableReason ?? 'Unavailable'}</Text>
                </View>
                {opt.network === recommended.network && (
                  <View style={styles.badgeSmall}>
                    <Text style={styles.badgeText}>Best</Text>
                  </View>
                )}
                {error && <Text style={styles.error}>{error}</Text>}
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
  networkRowDisabled: { opacity: 0.55 },
  networkName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  networkMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  footer: { paddingHorizontal: 20, paddingBottom: 32 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', height: 54,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  error: { color: colors.error, fontSize: 13, marginTop: 14, textAlign: 'center' },
});
}
