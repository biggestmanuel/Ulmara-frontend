import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { broadcastTransaction, sendPayment } from '../../lib/api/transactions';
import { toApiError, type ApiErrorShape } from '../../lib/api/client';
import { useTxStore } from '../../stores/txStore';
import { signEvmNativeTransfer } from '../../lib/signing/evm';
import { getSigningAdapter } from '../../lib/signing/chainAdapters';
import { prepareExternalTransfer, submitExternalTransfer } from '../../lib/api/externalTransfers';
import type { ChainId } from '../../lib/chains';

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
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState('');
  // Authorization failures (wrong PIN, lockout, send errors) surface inside
  // the PIN modal so the user can retry without closing it.
  const [pinError, setPinError] = useState<string | null>(null);
  const upsertTransaction = useTxStore((state) => state.upsertTransaction);

  const resolvedAddress = isExternal ? params.externalAddress : params.targetAddress;

  const handleSend = async (authorizationPin: string) => {
    setError(null);
    setPinError(null);
    if (isExternal) {
      if (!params.externalAddress || !params.asset || !params.amount || !params.network) {
        setPinError('This transfer is missing required details. Go back and try again.');
        return;
      }
      const chain = params.network.toLowerCase() as ChainId;
      const adapter = getSigningAdapter(chain);
      if (adapter.availability === 'unavailable') {
        setPinError(`External sending is unavailable: ${adapter.unavailableReason}. Your funds were not sent.`);
        return;
      }
      setSending(true);
      // Stage tracks how far the flow got so failures map to the right copy:
      // prepare (PIN/TriVerify), sign (local), submit (server-side verification).
      let stage: 'prepare' | 'sign' | 'submit' = 'prepare';
      try {
        // Stage 1 — authorize + validate on the server. The PIN rides with the
        // prepare request (same 5-attempt/15-minute lockout as internal sends)
        // and a rejected prepare leaves no intent behind.
        const intent = await prepareExternalTransfer({
          chain,
          asset: params.asset,
          amount: params.amount,
          to: params.externalAddress,
          pin: authorizationPin,
        });
        stage = 'sign';
        // Stage 2 — sign locally; keys never leave the device. The intent id
        // binds the signature to the server-verified transfer details.
        const signed = await adapter.signTransfer({ asset: params.asset, amount: params.amount, to: params.externalAddress, transactionId: intent.id });
        stage = 'submit';
        // Stage 3 — the server re-verifies the signature against the prepared
        // intent (recipient/amount/chain) before broadcasting anything.
        const submitted = await submitExternalTransfer(intent.id, signed);
        upsertTransaction(submitted);
        setPinModal(false);
        setDone(true);
        setTimeout(() => router.replace('/(tabs)/home'), 1200);
      } catch (err) {
        const apiError = toApiError(err);
        if (apiError.status === 409 || apiError.status === 410) {
          // Dead intent (reused/expired): restart the flow cleanly — close the
          // modal and surface the message on the confirm screen instead of
          // inviting a retry against an id that can never go through.
          setPin('');
          setPinError(null);
          setPinModal(false);
          setError('This request has expired, please try again.');
        } else if (stage === 'sign') {
          // Local signing failure (e.g. signing credentials unavailable) is not
          // a server rejection — show it on the confirm screen.
          setPin('');
          setPinError(null);
          setPinModal(false);
          setError(apiError.message);
        } else {
          // PIN/verification failures stay in the modal so the user can retry.
          setPinError(stage === 'submit' ? mapExternalSubmitError(apiError) : mapExternalPrepareError(apiError));
          setPin('');
          setPinModal(true);
        }
      } finally {
        setSending(false);
      }
      return;
    }

    if (!params.accountId || !params.asset || !params.amount || !params.network) {
      setPinError('This transfer is missing required details. Go back and try again.');
      return;
    }
    if (params.network !== 'ETH' || params.asset !== 'ETH') {
      setPinError('This wallet currently supports native ETH transfers on Ethereum only.');
      return;
    }

    setSending(true);
    try {
      const created = await sendPayment({
        recipientAccountId: params.accountId,
        amount: params.amount,
        symbol: params.asset,
        network: params.network,
        pin: authorizationPin,
      });
      const signedTx = await signEvmNativeTransfer({ network: params.network, asset: params.asset, to: params.targetAddress!, amount: params.amount });
      const broadcast = await broadcastTransaction(created.transaction.id, signedTx);
      upsertTransaction(broadcast);
      setPinModal(false);
      setDone(true);
      setTimeout(() => router.replace('/(tabs)/home'), 1200);
    } catch (err) {
      // Keep the modal open so the user can retry; wrong PINs and lockouts
      // are reported by the server without revealing attempt counts.
      setPinError(toApiError(err).message);
      setPin('');
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Check size={34} color={colors.success} />
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
        <Pressable style={styles.primaryBtn} onPress={() => setPinModal(true)} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm & Send</Text>}
        </Pressable>
      </View>
      <Modal visible={pinModal} transparent animationType="fade">
        <View style={styles.pinOverlay}>
          <View style={[styles.pinCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.pinTitle}>Confirm with PIN</Text>
            <Text style={styles.pinSubtitle}>Enter your 6-digit PIN to authorize this transfer.</Text>
            <TextInput
              autoFocus
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              value={pin}
              editable={!sending}
              onChangeText={(value) => {
                setPinError(null);
                setPin(value);
                if (value.length === 6) handleSend(value);
              }}
              style={[styles.pinInput, { color: colors.textPrimary, borderColor: colors.border }]} />
            {pinError && <Text style={styles.pinError}>{pinError}</Text>}
            {sending && <ActivityIndicator color={colors.primary} style={styles.pinSpinner} />}
            {/* Cancelling closes the modal without sending anything: no request
                is made, so a cancel can never count as a failed attempt. */}
            <Pressable onPress={() => { setPinModal(false); setPin(''); setPinError(null); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

// Error mapping for the external-send flow. 401 (wrong PIN) and 423 (lockout)
// pass through verbatim — the server wording is shared with the internal
// transfer's PIN gate, so the UX matches exactly. Everything else is
// translated to UX-appropriate copy without exposing backend internals.
function mapExternalPrepareError(apiError: ApiErrorShape): string {
  if (apiError.status === 401 || apiError.status === 423) return apiError.message;
  if (apiError.status === 400) {
    // A 400 on prepare is either a malformed PIN (its message is readable and
    // safe to show) or a TriVerify/format rejection of the recipient.
    if (/pin/i.test(apiError.message)) return apiError.message;
    return "This address doesn't look valid for the selected network. Double-check it and try again.";
  }
  if (apiError.status === 502 || apiError.status === 503) {
    return 'The network is busy right now. Please try again shortly.';
  }
  return apiError.message || 'Something went wrong. Please try again.';
}

function mapExternalSubmitError(apiError: ApiErrorShape): string {
  if (apiError.status === 401 || apiError.status === 423) return apiError.message;
  if (apiError.status === 400) {
    // The server's signed-transaction verification failed — keep the internals
    // out of the UI and offer a retry.
    return "This transaction couldn't be verified, please try again.";
  }
  return apiError.message || 'Something went wrong. Please try again.';
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
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
    rowLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
    rowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', maxWidth: '60%' },
    addressToggle: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
    addressToggleText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    addressBox: { marginTop: 10, backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
    addressText: { color: colors.textSecondary, fontSize: 12, fontFamily: 'monospace' },
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
    pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 24 },
    pinCard: { borderRadius: 24, padding: 24 },
    pinTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    pinSubtitle: { color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    pinInput: { borderWidth: 1, borderRadius: 12, marginTop: 20, padding: 14, textAlign: 'center', fontSize: 24, letterSpacing: 8 },
    pinError: { color: colors.error, fontSize: 13, lineHeight: 18, marginTop: 14, textAlign: 'center' },
    pinSpinner: { marginTop: 14 },
    cancelText: { color: colors.primary, textAlign: 'center', marginTop: 18, fontWeight: '700' },
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
