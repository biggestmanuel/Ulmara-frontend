import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';

// TODO: replace with lib/ramp/bachs.ts — create deposit session, get bank transfer details
const ASSETS = ['USDT', 'BTC', 'ETH', 'SOL', 'TON'] as const;
const QUICK_AMOUNTS = ['5000', '10000', '25000', '50000'];

type MockBankDetails = { bankName: string; accountNumber: string; accountName: string; reference: string };

function fakeCreateDepositSession(amountNgn: string): Promise<MockBankDetails> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        bankName: 'Wema Bank',
        accountNumber: '8102734491',
        accountName: 'Bachs/AccountWallet',
        reference: `DEP-${Date.now().toString().slice(-8)}`,
      });
    }, 900);
  });
}

export default function Deposit() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState<(typeof ASSETS)[number]>('USDT');
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<MockBankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    const amt = parseFloat(amount);
    if (!amt || amt < 1000) return setError('Minimum deposit is ₦1,000');

    setLoading(true);
    try {
      const res = await fakeCreateDepositSession(amount);
      setDetails(res);
    } catch {
      setError('Could not start deposit. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setDetails(null)}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Bank Transfer</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.transferAmount}>₦{parseFloat(amount).toLocaleString('en-NG')}</Text>
          <Text style={styles.transferSubtitle}>Transfer this exact amount to complete your deposit</Text>

          <View style={styles.detailsCard}>
            <DetailRow styles={styles} label="Bank Name" value={details.bankName} />
            <DetailRow styles={styles} label="Account Number" value={details.accountNumber} />
            <DetailRow styles={styles} label="Account Name" value={details.accountName} />
            <DetailRow styles={styles} label="Reference" value={details.reference} />
          </View>

          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Include the reference in your transfer narration. {asset} will be credited automatically once payment is confirmed.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.primaryBtnText}>I've Sent the Transfer</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Deposit</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>Receive as</Text>
          <View style={styles.chipRow}>
            {ASSETS.map((a) => (
              <Pressable
                key={a}
                style={[styles.chip, asset === a && styles.chipActive]}
                onPress={() => setAsset(a)}
              >
                <Text style={[styles.chipText, asset === a && styles.chipTextActive]}>{a}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 24 }]}>Amount (NGN)</Text>
          <TextInput
            style={styles.input}
            placeholder="₦0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
          />

          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((q) => (
              <Pressable key={q} style={styles.quickChip} onPress={() => setAmount(q)}>
                <Text style={styles.quickChipText}>₦{parseInt(q).toLocaleString('en-NG')}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleGenerate} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Get Transfer Details</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DetailRow({ styles, label, value }: { styles: ReturnType<typeof getStyles>; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
    label: { fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: '500' },
    input: {
      backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      color: colors.textPrimary, fontSize: 18, borderWidth: 1, borderColor: colors.border,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: '#FFFFFF' },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    quickChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    quickChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    error: { color: colors.error, fontSize: 13, marginTop: 14 },
    footer: { paddingHorizontal: 20, paddingBottom: 32 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center', height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    transferAmount: { color: colors.textPrimary, fontSize: 30, fontWeight: '700', textAlign: 'center', marginTop: 12 },
    transferSubtitle: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 24, paddingHorizontal: 20 },
    detailsCard: {
      backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18,
    },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
    detailLabel: { color: colors.textMuted, fontSize: 14 },
    detailValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
    warningBox: {
      backgroundColor: `${colors.warning}1A`, borderRadius: 12, borderWidth: 1,
      borderColor: `${colors.warning}40`, padding: 14, marginTop: 20,
    },
    warningText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  });
}
