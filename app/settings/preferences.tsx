import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getMe, updateSettings } from '../../lib/api/accountId';

const CURRENCIES = ['USD', 'NGN', 'EUR', 'GBP'] as const;
const LANGUAGES = [
  { label: 'English', code: 'en' },
  { label: 'French', code: 'fr' },
  { label: 'Portuguese', code: 'pt' },
] as const;
const NETWORKS = ['AUTO', 'TON', 'BSC', 'ETH', 'SOL', 'BASE', 'POLYGON', 'TRON'] as const;
const NETWORK_LABELS: Record<(typeof NETWORKS)[number], string> = {
  AUTO: 'Auto (Recommended)', TON: 'TON', BSC: 'BSC', ETH: 'ETH',
  SOL: 'SOL', BASE: 'Base', POLYGON: 'Polygon', TRON: 'TRON',
};

export default function Preferences() {
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('USD');
  const [languageCode, setLanguageCode] = useState('en');
  const [defaultNetwork, setDefaultNetworkState] = useState<(typeof NETWORKS)[number]>('AUTO');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (me.defaultCurrency) setCurrency(me.defaultCurrency);
        if (me.defaultLanguage) setLanguageCode(me.defaultLanguage);
        if (me.defaultNetwork) setDefaultNetworkState(me.defaultNetwork);
      } catch (err) {
        console.error('Failed to load preferences:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (patch: Partial<{ defaultCurrency: string; defaultLanguage: string; defaultNetwork: string | null }>) => {
    setSaving(true);
    try {
      await updateSettings(patch);
    } catch (err) {
      console.error('Failed to save preference:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#6C5CE7" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Preferences</Text>
        {saving ? <ActivityIndicator color="#6C5CE7" /> : <View style={{ width: 24 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionTitle}>Display Currency</Text>
        <View style={styles.chipRow}>
          {CURRENCIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, currency === c && styles.chipActive]}
              onPress={() => { setCurrency(c); save({ defaultCurrency: c }); }}
            >
              <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Language</Text>
        <View style={styles.card}>
          {LANGUAGES.map((l, idx) => (
            <Pressable
              key={l.code}
              style={[styles.optionRow, idx === LANGUAGES.length - 1 && styles.optionRowLast]}
              onPress={() => { setLanguageCode(l.code); save({ defaultLanguage: l.code }); }}
            >
              <Text style={styles.optionLabel}>{l.label}</Text>
              {languageCode === l.code && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Default Network</Text>
        <Text style={styles.helperText}>Used as the starting choice when sending crypto</Text>
        <View style={styles.card}>
          {NETWORKS.map((n, idx) => (
            <Pressable
              key={n}
              style={[styles.optionRow, idx === NETWORKS.length - 1 && styles.optionRowLast]}
              onPress={() => { setDefaultNetworkState(n); save({ defaultNetwork: n === 'AUTO' ? null : n }); }}
            >
              <Text style={styles.optionLabel}>{NETWORK_LABELS[n]}</Text>
              {defaultNetwork === n && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  back: { color: '#FFFFFF', fontSize: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  sectionTitle: { color: '#9A9AA5', fontSize: 13, fontWeight: '500', marginBottom: 10 },
  helperText: { color: '#5C5C66', fontSize: 12, marginBottom: 10, marginTop: -4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#17171D', borderWidth: 1, borderColor: '#26262E',
  },
  chipActive: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  chipText: { color: '#9A9AA5', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: '#17171D', borderRadius: 14, borderWidth: 1, borderColor: '#26262E',
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1D1D24',
  },
  optionRowLast: { borderBottomWidth: 0 },
  optionLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  checkmark: { color: '#8C7AFF', fontSize: 16, fontWeight: '700' },
});
