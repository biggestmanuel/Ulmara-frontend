import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import QRCode from 'react-native-qrcode-svg';
import { useUserStore } from '../../stores/userStore';
import { createPaymentRequest } from '../../lib/api/transactions';

const ASSETS = ['USDT', 'BTC', 'ETH', 'SOL', 'TON'] as const;

function formatAccountId(id: string): string {
  return id.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

export default function PaymentRequest() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const accountId = useUserStore((state) => state.accountId) ?? '';

  const [asset, setAsset] = useState<(typeof ASSETS)[number]>('USDT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [generated, setGenerated] = useState(false);
  const [requestLink, setRequestLink] = useState('');

  const handleGenerate = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    const request = await createPaymentRequest({ amount, symbol: asset, note });
    setRequestLink(request.link);
    setGenerated(true);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Payment request: ${amount} ${asset}${note ? ` — ${note}` : ''}\n${requestLink}`,
      });
    } catch {
      // cancelled
    }
  };

  if (generated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setGenerated(false)}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Payment Request</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <View style={styles.qrBox}><QRCode value={requestLink} size={160} /></View>
          <Text style={styles.requestAmount}>{amount} {asset}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Text style={styles.accountId}>{formatAccountId(accountId)}</Text>
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleShare}>
            <Text style={styles.primaryBtnText}>Share Request</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/home')}>
            <Text style={styles.secondaryText}>Done</Text>
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
          <Text style={styles.headerTitle}>Request Amount</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>Asset</Text>
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

          <Text style={[styles.label, { marginTop: 24 }]}>Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />

          <Text style={[styles.label, { marginTop: 24 }]}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="What's this for?"
            placeholderTextColor={colors.textMuted}
            value={note}
            onChangeText={setNote}
          />
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleGenerate}>
            <Text style={styles.primaryBtnText}>Generate Request</Text>
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
    body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, alignItems: 'stretch' },
    label: { fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: '500' },
    input: {
      backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      color: colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: colors.border,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: '#FFFFFF' },
    footer: { paddingHorizontal: 20, paddingBottom: 32, gap: 14, alignItems: 'center' },
    primaryBtn: {
      width: '100%', backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center', height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    secondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    qrBox: {
      width: 200, height: 200, backgroundColor: '#FFFFFF', borderRadius: 20,
      alignItems: 'center', justifyContent: 'center', padding: 16, alignSelf: 'center',
    },
    requestAmount: { color: colors.textPrimary, fontSize: 26, fontWeight: '700', marginTop: 20, textAlign: 'center' },
    note: { color: colors.textMuted, fontSize: 14, marginTop: 6, textAlign: 'center' },
    accountId: { color: colors.textMuted, fontSize: 14, marginTop: 16, textAlign: 'center', letterSpacing: 1 },
  });
}
