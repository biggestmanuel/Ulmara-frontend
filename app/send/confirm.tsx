import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { broadcastTransaction, sendPayment } from '../../lib/api/transactions';
import { toApiError } from '../../lib/api/client';
import { useTxStore } from '../../stores/txStore';
import { signEvmNativeTransfer } from '../../lib/signing/evm';

export default function SendConfirm() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  const params = useLocalSearchParams<{
    accountId?: string; recipientName?: string; externalAddress?: string;
    asset: string; amount: string; network: string; networkName: string; fee: string; targetAddress?: string;
  }>();

  const isExternal = !params.accountId;
  const [showAddress, setShowAddress] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upsertTransaction = useTxStore((state) => state.upsertTransaction);

  const resolvedAddress = isExternal ? params.externalAddress : params.targetAddress;

  const handleSend = async () => {
    setError(null);
    if (isExternal) {
      setError('External wallet transfers are not available yet. Your funds were not sent.');
      return;
    }

    if (!params.accountId || !params.asset || !params.amount || !params.network) {
      setError('This transfer is missing required details. Go back and try again.');
      return;
    }

    setSending(true);
    try {
      const created = await sendPayment({
        recipientAccountId: params.accountId,
        amount: params.amount,
        symbol: params.asset,
        network: params.network,
      });
      const signedTx = await signEvmNativeTransfer({ network: params.network, asset: params.asset, to: params.targetAddress!, amount: params.amount });
      const broadcast = await broadcastTransaction(created.transaction.id, signedTx);
      upsertTransaction(broadcast);
      setDone(true);
      setTimeout(() => router.replace('/(tabs)/home'), 1200);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Text style={styles.successCheck}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Sent</Text>
          <Text style={styles.successSubtitle}>
            {params.amount} {params.asset} is on its way
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Confirm</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.bigAmount}>{params.amount} {params.asset}</Text>
        <Text style={styles.toText}>
          to {isExternal ? 'External Wallet' : params.recipientName}
        </Text>

        <View style={styles.summaryCard}>
          <Row styles={styles} label="Recipient" value={isExternal ? 'External Wallet' : `${params.recipientName} (${params.accountId})`} />
          <Row styles={styles} label="Network" value={params.networkName} />
          <Row styles={styles} label="Network Fee" value={params.fee} />
          <Row styles={styles} label="Amount" value={`${params.amount} ${params.asset}`} />

          <Pressable style={styles.addressToggle} onPress={() => setShowAddress((v) => !v)}>
            <Text style={styles.addressToggleText}>
              {showAddress ? 'Hide resolved address' : 'Show resolved address'}
            </Text>
          </Pressable>
          {showAddress && (
            <View style={styles.addressBox}>
              <Text style={styles.addressText}>{resolvedAddress}</Text>
            </View>
          )}
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Double-check the details above. Crypto transactions can't be reversed once sent.
          </Text>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={handleSend} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm & Send</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ styles, label, value }: { styles: ReturnType<typeof getStyles>; label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
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
    body: { flex: 1, paddingHorizontal: 20, paddingTop: 20, alignItems: 'center' },
    bigAmount: { color: colors.textPrimary, fontSize: 32, fontWeight: '700' },
    toText: { color: colors.textMuted, fontSize: 14, marginTop: 6, marginBottom: 24 },
    summaryCard: {
      width: '100%', backgroundColor: colors.surface, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, padding: 18,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
    rowLabel: { color: colors.textMuted, fontSize: 14 },
    rowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', maxWidth: '60%' },
    addressToggle: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider },
    addressToggleText: { color: colors.primaryHover, fontSize: 13, fontWeight: '600' },
    addressBox: { marginTop: 8, backgroundColor: colors.background, borderRadius: 10, padding: 12 },
    addressText: { color: colors.textSecondary, fontSize: 12 },
    warningBox: {
      width: '100%', backgroundColor: `${colors.warning}1A`, borderRadius: 12, borderWidth: 1,
      borderColor: `${colors.warning}40`, padding: 14, marginTop: 20,
    },
    warningText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
    error: { color: colors.error, fontSize: 13, lineHeight: 18, marginTop: 12, textAlign: 'center' },
    footer: { paddingHorizontal: 20, paddingBottom: 32 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center', height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    successCircle: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.success}22`,
      alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    successCheck: { color: colors.success, fontSize: 32, fontWeight: '700' },
    successTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
    successSubtitle: { color: colors.textMuted, fontSize: 14, marginTop: 8 },
  });
}
