import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useThemeStore, type ThemeColors } from '../../lib/theme';
import { defineStyles } from '../../lib/theme/styles';
import { broadcastTransaction, sendPayment } from '../../lib/api/transactions';
import { friendlyError, toApiError } from '../../lib/api/client';
import { useTxStore } from '../../stores/txStore';
import { getSigningAdapterByWire } from '../../lib/signing/chainAdapters';
import { prepareExternalTransfer, submitExternalTransfer } from '../../lib/api/externalTransfers';
import { isTokenSymbol } from '../../constants/tokens';
import { authenticateWithBiometrics, describeOutcome } from '../../lib/security/biometrics';
import { useUserStore } from '../../stores/userStore';
import { BackButton } from '../../components/navigation/BackButton';
// Aliased because the bare name `Screen` collides with the DOM lib's global
// `Screen` type when the DOM lib is in scope.
import {
  Button,
  Input,
  Screen as UlmaraScreen,
  Sheet,
  Touchable,
  Typography,
} from '../../components/ui';
import { space } from '../../lib/theme';

const PIN_LENGTH = 6;

type Stage = 'idle' | 'authorizing' | 'prepare' | 'sign' | 'submit' | 'done';

export default function SendConfirm() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  const params = useLocalSearchParams<{
    accountId?: string;
    recipientName?: string;
    externalAddress?: string;
    asset: string;
    amount: string;
    network: string;
    networkName: string;
    fee: string;
    targetAddress?: string;
    isToken?: string;
    nativeBalance?: string;
    insufficientGas?: string;
  }>();

  const isExternal = !params.accountId;
  const isToken = isTokenSymbol(params.asset ?? '');

  const [showAddress, setShowAddress] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricNotice, setBiometricNotice] = useState<string | null>(null);

  const upsertTransaction = useTxStore((s) => s.upsertTransaction);
  const biometricEnabled = useUserStore((s) => s.biometricEnabled);

  // One idempotency key per transfer attempt (this screen). Every request of
  // the attempt carries it: if the server created the transaction but the
  // response was lost (mobile network timeout, app killed mid-flight), the
  // retry returns the original transaction instead of sending twice.
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = randomUUID();
  const idempotencyKey = idempotencyKeyRef.current;

  // Synchronous double-submit guard: React state updates are async, so two
  // taps in the same instant can both observe `stage === 'idle'`. A ref check
  // runs before either request is built.
  const submitLockRef = useRef(false);

  const resolvedAddress = isExternal ? params.externalAddress : params.targetAddress;
  const sending = stage !== 'idle' && stage !== 'done';

  // --- External token transfers are blocked by the server ---------------------
  // `externalTransferService.prepare` rejects any asset that is not the chain's
  // native coin ("USDC transfers are not supported on ETH"), and
  // `verifySignedTransaction` rejects any signed payload with a non-empty
  // `data` field ("The signed transaction contains unexpected data") — which
  // every ERC-20 transfer has. The client cannot work around either check, so
  // it refuses up front with the reason instead of letting the user type a PIN
  // for a transfer that is guaranteed to fail.
  const externalTokenBlocked = isExternal && isToken;

  useEffect(() => {
    if (externalTokenBlocked) {
      setError(
        `${params.asset} transfers to external wallets are not supported yet. Sending to another Ulmara user works today.`
      );
    }
  }, [externalTokenBlocked, params.asset]);

  const openAuthorization = useCallback(() => {
    if (stage !== 'idle') return;
    setError(null);
    setPinError(null);
    setBiometricNotice(null);
    setPin('');
    setPinModal(true);
  }, [stage]);

  /**
   * Optional local biometric authorization, run *before* PIN entry.
   *
   * This is an extra gate the user opts into, never a replacement: the PIN is
   * still typed, still verified server-side, and the lockout is untouched. It
   * exists so a stolen unlocked phone cannot start a transfer.
   */
  const handleBiometricAuthorize = useCallback(async () => {
    if (biometricBusy) return;
    setBiometricBusy(true);
    setBiometricNotice(null);
    try {
      const outcome = await authenticateWithBiometrics({
        promptTitle: 'Authorize this transfer',
        promptSubtitle: `${params.amount} ${params.asset} on ${params.networkName}`,
        fallbackLabel: 'Use PIN',
      });
      if (outcome === 'success') {
        setBiometricNotice('Identity confirmed. Enter your PIN to authorise.');
        return;
      }
      if (outcome === 'cancelled' || outcome === 'fallback') return;
      setBiometricNotice(describeOutcome(outcome) ?? 'Biometric check did not complete.');
    } finally {
      setBiometricBusy(false);
    }
  }, [biometricBusy, params.amount, params.asset, params.networkName]);

  const handleSendError = useCallback(
    (err: unknown, external: boolean, tokenBlocked: boolean) => {
      const apiError = toApiError(err);
      setPin('');

      if (tokenBlocked) {
        setPinModal(false);
        setError(friendlyError(err, 'This transfer type is not supported yet.'));
        return;
      }

      if (apiError.status === 401 || apiError.status === 423) {
        // Wrong PIN or lockout — retryable in place. The server's wording is
        // non-revealing by design and shared with the app-unlock PIN gate.
        setPinError(apiError.message);
        setPinModal(true);
        return;
      }

      if (external) {
        if (apiError.status === 409 || apiError.status === 410) {
          setPinModal(false);
          setError('This request has expired, please try again.');
          return;
        }
        if (apiError.status === 400) {
          if (/pin/i.test(apiError.message)) {
            setPinError(apiError.message);
            setPinModal(true);
          } else {
            setPinModal(false);
            setError("This address doesn't look valid for the selected network. Double-check it and try again.");
          }
          return;
        }
        if (apiError.status === 502 || apiError.status === 503) {
          setPinError('The network is busy right now. Please try again shortly.');
          setPinModal(true);
          return;
        }
        setPinModal(false);
        setError(friendlyError(err, 'Something went wrong. Please try again.'));
        return;
      }

      // Internal transfer. A wrong PIN / lockout stays in the modal; anything
      // else (insufficient balance, unknown Account ID, node failure) means the
      // attempt itself is invalid and belongs on the confirm screen.
      if (apiError.status === 400 || apiError.status === 404) {
        setPinModal(false);
        setError(friendlyError(err, 'This transfer could not be started.'));
        return;
      }
      setPinError(friendlyError(err, 'Something went wrong. Please try again.'));
      setPinModal(true);
    },
    []
  );

  const handleSend = useCallback(
    async (authorizationPin: string) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setPinError(null);
      setError(null);

      try {
        if (isExternal) {
          if (!params.externalAddress || !params.asset || !params.amount || !params.network) {
            setPinError('This transfer is missing required details. Go back and try again.');
            return;
          }
          if (externalTokenBlocked) {
            setPinModal(false);
            setError(
              `${params.asset} transfers to external wallets are not supported yet.`
            );
            return;
          }

          const adapter = getSigningAdapterByWire(params.network);
          if (!adapter || adapter.availability === 'unavailable') {
            setPinError(
              `External sending is unavailable: ${adapter?.unavailableReason ?? 'this network is not supported'}. Your funds were not sent.`
            );
            return;
          }

          setStage('prepare');
          // Stage 1 — authorize + validate on the server. The PIN rides with
          // the prepare request (same 5-attempt/15-minute lockout as internal
          // sends) and a rejected prepare leaves no intent behind.
          const intent = await prepareExternalTransfer({
            chain: params.network,
            asset: params.asset,
            amount: params.amount,
            to: params.externalAddress,
            pin: authorizationPin,
          });

          const submitIdempotencyKey = randomUUID();
          setStage('sign');
          // Stage 2 — sign locally; keys never leave the device. The intent id
          // binds the signature to the server-verified transfer details.
          const signed = await adapter.signTransfer({
            asset: params.asset,
            amount: params.amount,
            to: params.externalAddress,
            transactionId: intent.id,
          });

          setStage('submit');
          // Stage 3 — the server re-verifies the signature against the prepared
          // intent (recipient/amount/chain) before broadcasting anything.
          const submitted = await submitExternalTransfer(intent.id, signed, submitIdempotencyKey);
          upsertTransaction(submitted);
          setPinModal(false);
          setStage('done');
          setTimeout(() => router.replace('/(tabs)/home'), 1200);
          return;
        }

        // --- Internal (Account ID) transfer ---
        if (!params.accountId || !params.asset || !params.amount || !params.network) {
          setPinError('This transfer is missing required details. Go back and try again.');
          return;
        }
        if (!params.targetAddress) {
          setPinError('We could not resolve the recipient address. Go back and try again.');
          return;
        }

        const adapter = getSigningAdapterByWire(params.network);
        if (!adapter || adapter.availability === 'unavailable') {
          setPinError(
            `Sending is unavailable: ${adapter?.unavailableReason ?? 'this network is not supported'}. Your funds were not sent.`
          );
          return;
        }

        setStage('prepare');
        // The backend records the ledger row (and applies the PIN gate and
        // idempotency) before the signature exists — the broadcast endpoint then
        // takes the signed payload.
          const created = await sendPayment({
          recipientAccountId: params.accountId,
          amount: params.amount,
          symbol: params.asset,
          network: params.network,
          pin: authorizationPin,
          idempotencyKey,
        });

        setStage('sign');
        const signedTx = await adapter.signTransfer({
          asset: params.asset,
          amount: params.amount,
          to: params.targetAddress,
        });

        setStage('submit');
        const broadcast = await broadcastTransaction(created.transaction.id, signedTx, idempotencyKey);
        upsertTransaction(broadcast);
        setPinModal(false);
        setStage('done');
        setTimeout(() => router.replace('/(tabs)/home'), 1200);
      } catch (err) {
        handleSendError(err, isExternal, externalTokenBlocked);
      } finally {
        if (stage !== 'done') setStage('idle');
        submitLockRef.current = false;
      }
    },
    // `stage` is read in the finally block only to decide whether to reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isExternal, externalTokenBlocked, params, upsertTransaction, idempotencyKey]
  );

  /**
   * Maps a failure to where the user should see it. PIN/authorization problems
   * stay inside the modal so the user can retry without losing their place;
   * everything that invalidates the attempt itself goes to the confirm screen.
   */
  const stageLabel = useMemo(() => {
    switch (stage) {
      case 'prepare':
        return 'Authorising with the server…';
      case 'sign':
        return 'Signing on this device…';
      case 'submit':
        return 'Broadcasting…';
      default:
        return null;
    }
  }, [stage]);

  if (stage === 'done') {
    return (
      <UlmaraScreen center testID="send-success">
        <View style={styles.successWrap}>
          <View style={[styles.successCircle, { backgroundColor: colors.successTint }]}>
            <Ionicons name="checkmark" size={34} color={colors.success} />
          </View>

          <Typography variant="title" style={styles.successTitle}>
            Sent
          </Typography>

          <Typography variant="amount" numeric style={styles.successAmount}>
            {params.amount} {params.asset}
          </Typography>

          <Typography variant="body" color={colors.textMuted} style={styles.successSubtitle}>
            is on its way
            {isExternal ? ' to that wallet' : ` to ${params.recipientName ?? 'your recipient'}`}.
          </Typography>

          {isToken ? (
            <Typography variant="caption" color={colors.textMuted} style={styles.successMeta}>
              A network fee was charged in {params.networkName}'s native coin. ERC-20 tokens do
              not pay for themselves.
            </Typography>
          ) : null}

          <Button
            label="View transaction"
            onPress={() => router.replace('/(tabs)/activity')}
            style={styles.successBtn}
          />
          <Button
            label="Done"
            variant="ghost"
            onPress={() => router.replace('/(tabs)/home')}
          />
        </View>
      </UlmaraScreen>
    );
  }

  return (
    <UlmaraScreen testID="send-confirm-screen">
      <View style={styles.header}>
        <BackButton />
        <Typography variant="titleSm" style={styles.headerTitle}>
          Confirm
        </Typography>
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* The amount is the largest type in the app, because on this screen it
            is the one number the user must be certain about. */}
        <View style={styles.headline}>
          <Typography variant="amount" numeric style={styles.bigAmount}>
            {params.amount} {params.asset}
          </Typography>
          <Typography variant="body" color={colors.textMuted} style={styles.toText}>
            to {isExternal ? 'an external wallet' : params.recipientName ?? 'your recipient'}
          </Typography>
        </View>

        <View style={styles.summary}>
          <SummaryRow label="Asset" value={params.asset} />
          <SummaryRow label="Asset type" value={isToken ? 'ERC-20 token' : 'Native coin'} />
          <SummaryRow label="Network" value={params.networkName} />
          <SummaryRow
            label={isToken ? 'Network fee (native)' : 'Network fee'}
            value={params.fee || '—'}
            emphasis={isToken}
          />
          {isToken && params.nativeBalance ? (
            <SummaryRow label="Your native balance" value={params.nativeBalance} />
          ) : null}
          <SummaryRow
            label="Recipient"
            value={isExternal ? 'External wallet' : params.recipientName ?? 'Ulmara user'}
            last={!showAddress}
          />

          <Touchable
            accessibilityRole="button"
            accessibilityLabel={showAddress ? 'Hide recipient address' : 'Show recipient address'}
            accessibilityState={{ expanded: showAddress }}
            onPress={() => setShowAddress((v) => !v)}
            pressScale={0.98}
            style={styles.addressToggle}
          >
            <Ionicons
              name={showAddress ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={colors.primary}
            />
            <Typography variant="label" color={colors.primary}>
              {showAddress ? 'Hide recipient address' : 'Show recipient address'}
            </Typography>
          </Touchable>

          {showAddress ? (
            <View style={[styles.addressBox, { backgroundColor: colors.surfaceElevated }]}>
              <Typography variant="code">{resolvedAddress ?? 'Not resolved'}</Typography>
            </View>
          ) : null}
        </View>

        {isToken ? (
          <View style={[styles.notice, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Typography variant="caption" color={colors.primary} style={styles.noticeText}>
              {params.asset} is an ERC-20 token. It does not pay for itself — the fee above is
              charged in the {params.networkName} native coin, so you need a small{' '}
              {feeSymbol(params.fee)} balance as well as the tokens you are sending.
            </Typography>
          </View>
        ) : null}

        {params.insufficientGas === '1' ? (
          <View style={[styles.notice, { backgroundColor: colors.warningTint }]}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Typography variant="caption" color={colors.warning} style={styles.noticeText}>
              Your {feeSymbol(params.fee)} balance does not cover the network fee for this
              transfer. Add some {feeSymbol(params.fee)} before sending.
            </Typography>
          </View>
        ) : null}

        <View style={[styles.notice, { backgroundColor: colors.surfaceElevated }]}>
          <Ionicons name="shield-outline" size={16} color={colors.textSecondary} />
          <Typography variant="caption" color={colors.textSecondary} style={styles.noticeText}>
            Check the details above. Crypto transfers cannot be reversed once sent.
          </Typography>
        </View>

        {error ? (
          <Typography
            variant="label"
            color={colors.error}
            style={styles.error}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {error}
          </Typography>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {/* Disabled while a request is in flight; `openAuthorization` also guards
            synchronously so a double-tap that beats the state update cannot fire
            two transfers. */}
        <Button
          label={sending ? stageLabel ?? 'Working…' : 'Confirm and send'}
          onPress={openAuthorization}
          loading={sending}
          disabled={sending || externalTokenBlocked}
        />
      </View>

      <Sheet
        visible={pinModal}
        onClose={() => {
          // Cancelling closes the sheet without sending anything: no request is
          // made, so a cancel can never count as a failed attempt.
          if (sending) return;
          setPinModal(false);
          setPin('');
          setPinError(null);
        }}
        title="Confirm with your PIN"
        subtitle={`Enter your ${PIN_LENGTH}-digit PIN to authorise this transfer.`}
        footer={
          biometricEnabled ? (
            <Button
              label={biometricBusy ? 'Checking…' : 'Authorise with biometrics'}
              variant="secondary"
              onPress={handleBiometricAuthorize}
              loading={biometricBusy}
              disabled={sending}
              accessibilityLabel="Authorise this transfer with biometrics"
            />
          ) : null
        }
      >
        <Input
          autoFocus
          label="PIN"
          placeholder="••••••"
          value={pin}
          onChangeText={(value) => {
            setPinError(null);
            const next = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
            setPin(next);
            if (next.length === PIN_LENGTH) void handleSend(next);
          }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_LENGTH}
          editable={!sending}
          error={pinError ?? undefined}
          hint={biometricNotice ?? undefined}
        />
      </Sheet>
    </UlmaraScreen>
  );
}

/** One label/value row in the summary block. */
function SummaryRow({
  label,
  value,
  emphasis = false,
  last = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  last?: boolean;
}) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View
      style={[
        summaryStyles.row,
        last
          ? null
          : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
      ]}
    >
      <Typography variant="body" color={colors.textSecondary}>
        {label}
      </Typography>
      <Typography
        variant={emphasis ? 'titleSm' : 'body'}
        color={colors.textPrimary}
        numeric
        style={summaryStyles.value}
      >
        {value}
      </Typography>
    </View>
  );
}

/**
 * Layout for the summary block, defined at module scope because it does not
 * depend on the theme — the theme supplies colours inline where they are needed.
 */
const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.md,
  },
  value: { flexShrink: 1, textAlign: 'right' },
});

/** Extracts the native gas symbol from a formatted fee string. */
function feeSymbol(fee: string): string {
  const parts = fee.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : 'the network';
}

/**
 * Layout for the redesigned confirm body.
 *
 * Only the keys the new markup actually reads are defined. The pre-redesign
 * version carried 29 more — a hand-rolled modal, its overlay, card, PIN field
 * and spinner, a summary card with its own row component, a primary button with
 * a hardcoded `#FFFFFF` label, and a `‹` back glyph. All of that is now the
 * shared `Sheet` / `Button` / `Input` / `BackButton`, and leaving the old
 * entries behind is how a design system quietly grows a second, private one.
 */
const getStyles = defineStyles((colors: ThemeColors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
    headerTitle: { flex: 1 },

    bodyScroll: { flex: 1 },
    body: { paddingTop: space.lg, paddingBottom: space.xl, gap: space.lg },

    headline: { alignItems: 'center', paddingTop: space.xl, paddingBottom: space.xxl },
    bigAmount: { textAlign: 'center' },
    toText: { textAlign: 'center', marginTop: space.sm },

    summary: { marginBottom: space.xl },
    addressToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      alignSelf: 'flex-start',
      paddingVertical: space.sm,
    },
    addressBox: { padding: space.md, borderRadius: 12 },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      padding: space.md,
      borderRadius: 12,
      marginBottom: space.md,
    },
    noticeText: { flex: 1 },

    error: { marginTop: space.sm },

    footer: { paddingTop: space.lg },

    successWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    successCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.xl,
    },
    successTitle: {},
    successSubtitle: { marginTop: space.sm, textAlign: 'center' },
    successAmount: { marginTop: space.lg },
    successMeta: { marginTop: space.md, textAlign: 'center', maxWidth: 320 },
    successBtn: { marginTop: space.xxl },
  })
);
