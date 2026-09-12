import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';

// TODO: replace with lib/api/accountId resolve call
type ResolvedProfile = { name: string; accountId: string } | null;
type TransferMode = 'ulmara' | 'external';

function fakeResolve(id: string): Promise<ResolvedProfile> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(id.length === 10 ? { name: 'Chidi Okafor', accountId: id } : null);
    }, 500);
  });
}

const ASSETS = ['USDT', 'BTC', 'ETH', 'SOL', 'TON'] as const;

export default function SendIndex() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  const [accountId, setAccountId] = useState('');
  const [transferMode, setTransferMode] = useState<TransferMode>('ulmara');
  const [profile, setProfile] = useState<ResolvedProfile>(null);
  const [resolving, setResolving] = useState(false);
  const [asset, setAsset] = useState<(typeof ASSETS)[number]>('USDT');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const digits = accountId.replace(/\D/g, '');
    setProfile(null);
    if (digits.length !== 10) return;

    setResolving(true);
    fakeResolve(digits).then((p) => {
      setProfile(p);
      setResolving(false);
    });
  }, [accountId]);

  const handleContinue = () => {
    setError(null);
    if (transferMode === 'external') {
      router.push('/send/external-wallet');
      return;
    }
    if (!profile) return setError('Enter a valid 10-digit Account ID');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError('Enter a valid amount');

    router.push({
      pathname: '/send/network-select',
      params: { accountId: profile.accountId, recipientName: profile.name, asset, amount },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionEyebrow}>TRANSFER TYPE</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeCard, transferMode === 'ulmara' && styles.modeCardActive]}
              onPress={() => setTransferMode('ulmara')}
            >
              <View style={[styles.modeIcon, transferMode === 'ulmara' && styles.modeIconActive]}>
                <Text style={styles.modeIconText}>@</Text>
              </View>
              <Text style={[styles.modeTitle, transferMode === 'ulmara' && styles.modeTitleActive]}>Transfer to Ulmara</Text>
              <Text style={styles.modeDescription}>Use an Account ID</Text>
            </Pressable>
            <Pressable
              style={[styles.modeCard, transferMode === 'external' && styles.modeCardActive]}
              onPress={() => setTransferMode('external')}
            >
              <View style={[styles.modeIcon, transferMode === 'external' && styles.modeIconActive]}>
                <Text style={styles.modeIconText}>↗</Text>
              </View>
              <Text style={[styles.modeTitle, transferMode === 'external' && styles.modeTitleActive]}>Transfer to external wallet</Text>
              <Text style={styles.modeDescription}>Send to a blockchain address</Text>
            </Pressable>
          </View>
          {transferMode === 'external' && (
            <Text style={styles.riskNote}>External transfers cannot be reversed. Check the address and network carefully.</Text>
          )}

          {transferMode === 'ulmara' && <>
          <Text style={styles.label}>Recipient Account ID</Text>
          <TextInput
            style={styles.input}
            placeholder="0000 000 000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={accountId}
            onChangeText={(v) => setAccountId(v.replace(/\D/g, '').slice(0, 10))}
          />

          {resolving && (
            <View style={styles.resolveRow}>
              <ActivityIndicator size="small" color={colors.primaryHover} />
              <Text style={styles.resolveText}>Looking up Account ID...</Text>
            </View>
          )}

          {profile && !resolving && (
            <View style={styles.profileRow}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{profile.name.charAt(0)}</Text>
              </View>
              <Text style={styles.profileName}>{profile.name}</Text>
            </View>
          )}

          <Text style={[styles.label, { marginTop: 24 }]}>Asset</Text>
          <View style={styles.assetRow}>
            {ASSETS.map((a) => (
              <Pressable
                key={a}
                style={[styles.assetChip, asset === a && styles.assetChipActive]}
                onPress={() => setAsset(a)}
              >
                <Text style={[styles.assetText, asset === a && styles.assetTextActive]}>{a}</Text>
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

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.externalLink} onPress={() => router.push('/send/external-wallet')}>
            <Text style={styles.externalLinkText}>Send to an external wallet instead</Text>
          </Pressable>
          </>}
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.primaryBtn} onPress={handleContinue}>
            <Text style={styles.primaryBtnText}>{transferMode === 'external' ? 'Continue to external wallet' : 'Continue'}</Text>
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
    sectionEyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
    modeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    modeCard: {
      flex: 1, minHeight: 138, padding: 14, borderRadius: 16,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    modeCardActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    modeIcon: {
      width: 32, height: 32, borderRadius: 11, backgroundColor: colors.surfaceElevated,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    modeIconActive: { backgroundColor: colors.primaryLight },
    modeIconText: { color: colors.primary, fontSize: 17, fontWeight: '800' },
    modeTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '800', lineHeight: 17 },
    modeTitleActive: { color: colors.primary },
    modeDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 5 },
    riskNote: { color: colors.warning, fontSize: 12, lineHeight: 17, marginBottom: 8 },
    label: { fontSize: 13, color: colors.textMuted, marginBottom: 8, fontWeight: '500' },
    input: {
      backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      color: colors.textPrimary, fontSize: 18, borderWidth: 1, borderColor: colors.border,
    },
    resolveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    resolveText: { color: colors.textMuted, fontSize: 13 },
    profileRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
      backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border,
    },
    profileAvatar: {
      width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    profileAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    profileName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    assetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    assetChip: {
      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    assetChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    assetText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    assetTextActive: { color: '#FFFFFF' },
    error: { color: colors.error, fontSize: 13, marginTop: 12 },
    externalLink: { marginTop: 28, alignItems: 'center' },
    externalLinkText: { color: colors.primaryHover, fontSize: 14, fontWeight: '600' },
    footer: { paddingHorizontal: 20, paddingBottom: 32 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center', height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  });
}
