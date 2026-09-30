import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { useTxStore } from '../../stores/txStore';
import { useUserStore } from '../../stores/userStore';
import { radius, useThemeStore, type ThemeColors } from '../../lib/theme';
import { defineStyles } from '../../lib/theme/styles';
import { fetchTransactionById, type Transaction } from '../../lib/api/transactions';
import { friendlyError } from '../../lib/api/client';
import { ReceiptCard, type ReceiptData } from '../../components/transaction/ReceiptCard';
import { useCopyToast, CopyToast } from '../../components/ui/CopyToast';
import { BackButton } from '../../components/navigation/BackButton';
import {
  Button,
  EmptyState,
  IconButton,
  Screen,
  Touchable,
  Typography,
} from '../../components/ui';
import { isTokenSymbol } from '../../constants/tokens';
import { getEvmNetworkName, nativeSymbolForChain } from '../../lib/chains/evmConfig';
import { CHAINS } from '../../constants/chains';

const EVM_CHAINS = ['eth', 'bsc', 'base', 'polygon'] as const;
type EvmChain = (typeof EVM_CHAINS)[number];

/** Human network name from the UPPERCASE wire identifier. */
function networkLabelFor(wire: string): string {
  const chain = wire.toLowerCase() as keyof typeof CHAINS;
  if ((EVM_CHAINS as readonly string[]).includes(chain)) {
    return getEvmNetworkName(chain as EvmChain);
  }
  return CHAINS[chain]?.name ?? wire;
}

/** The coin that pays gas on that network. Never the token. */
function nativeSymbolFor(wire: string): string {
  const chain = wire.toLowerCase() as keyof typeof CHAINS;
  if ((EVM_CHAINS as readonly string[]).includes(chain)) {
    return nativeSymbolForChain(chain as EvmChain);
  }
  return CHAINS[chain]?.symbol ?? wire;
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const receiptRef = useRef<View>(null);

  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * Share / save outcomes.
   *
   * These were five `Alert.alert` calls. `Alert` is a system dialog: it ignores
   * the theme completely on Android and renders as a bare, unstyled browser
   * dialog on web, so the moments the user most wants to read clearly — "saved",
   * "permission required", "could not share" — were the moments the app looked
   * least like itself. The same reasoning that replaced the PIN-change alert in
   * `settings/security.tsx`.
   */
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [fallbackTx, setFallbackTx] = useState<Transaction | null>(null);
  const [loadingDirect, setLoadingDirect] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { copyToClipboard, message: toastMessage, visible: toastVisible } = useCopyToast();

  // Selector-based subscriptions, not `useUserStore()` / `useTxStore()` with no
  // selector: the latter re-renders this screen on *every* store write anywhere
  // in the app (a balance refresh, a push arriving, a page of transactions
  // loading), even though this screen reads four scalars and one list.
  const accountId = useUserStore((s) => s.accountId);
  const profileName = useUserStore((s) => s.profile?.name);
  const colors = useThemeStore((s) => s.colors);
  const styles = useMemo(() => getStyles(colors), [colors]);

  const items = useTxStore((s) => s.items);
  const isLoading = useTxStore((s) => s.isLoading);
  const fetchInitial = useTxStore((s) => s.fetchInitial);

  // `storeTx` is a derived lookup, so it is memoized on the two inputs rather
  // than rescanning the list on every render.
  const storeTx = useMemo(
    () => (id ? items.find((item) => item.id === id) : undefined),
    [items, id]
  );

  // Fallback: a cold deep link (a notification tap) lands here with nothing in
  // the store, so the row is fetched by id.
  useEffect(() => {
    if (storeTx || !id) return;
    let cancelled = false;
    setLoadingDirect(true);
    setLoadError(null);
    fetchTransactionById(id)
      .then((data) => {
        if (!cancelled) setFallbackTx(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(friendlyError(err, 'We could not load this transaction.'));
        // Also refresh the list — a status flip may be why the id was unknown.
        void fetchInitial();
      })
      .finally(() => {
        if (!cancelled) setLoadingDirect(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchInitial, id, storeTx]);

  const tx = storeTx ?? fallbackTx;

  const captureReceiptUri = useCallback(async (): Promise<string> => {
    if (!receiptRef.current) {
      throw new Error('The receipt is still rendering. Try again in a moment.');
    }
    return captureRef(receiptRef, { format: 'png', quality: 1 });
  }, []);

  const handleShareReceipt = useCallback(async () => {
    setSharing(true);
    setNotice(null);
    try {
      const uri = await captureReceiptUri();
      if (!(await Sharing.isAvailableAsync())) {
        setNotice({
          tone: 'error',
          text: 'Sharing is not supported on this device. You can save the receipt instead.',
        });
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Ulmara receipt ${id ?? ''}` });
      setNotice({ tone: 'success', text: 'Receipt shared' });
    } catch (err) {
      // friendlyError, not `err.message` — a raw native error string is not
      // something a user can act on.
      setNotice({
        tone: 'error',
        text: friendlyError(err, 'Unable to share the receipt image.'),
      });
    } finally {
      setSharing(false);
    }
  }, [captureReceiptUri, id]);

  const handleSaveToGallery = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      const MediaLibrary = await import('expo-media-library');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setNotice({
          tone: 'error',
          text: 'Allow photo access in your device settings to save receipts to your gallery.',
        });
        return;
      }
      const uri = await captureReceiptUri();
      const asset = await MediaLibrary.createAssetAsync(uri);
      try {
        const album = await MediaLibrary.getAlbumAsync('Ulmara');
        if (album == null) {
          await MediaLibrary.createAlbumAsync('Ulmara', asset, false);
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        }
      } catch {
        // Album bookkeeping failed; the asset is already in the camera roll.
      }
      setNotice({ tone: 'success', text: 'Receipt saved to your gallery' });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: friendlyError(err, 'Unable to save the receipt image.'),
      });
    } finally {
      setSaving(false);
    }
  }, [captureReceiptUri]);

  const handleCopyId = useCallback(() => {
    if (id) void copyToClipboard(id, 'Transaction ID copied to clipboard');
  }, [id, copyToClipboard]);

  // Computed before the early returns below so the hook order is identical
  // across the loading / not-found / loaded branches. Memoized so the
  // view-shot capture target is not re-rendered by unrelated state changes.
  const receiptData = useMemo<ReceiptData | null>(() => {
    if (!tx) return null;
    const sent = tx.direction === 'sent';
    const token = isTokenSymbol(tx.symbol);
    const myName = profileName || 'You';
    const myTag = accountId ? `@${accountId}` : undefined;
    const counterpartyTag = tx.counterpartyAccountId ? `@${tx.counterpartyAccountId}` : undefined;
    const counterpartyName = tx.counterpartyAccountId || 'External account';
    return {
      id: tx.id,
      direction: tx.direction,
      status: tx.status,
      amount: tx.amount,
      symbol: tx.symbol,
      network: tx.network,
      networkLabel: networkLabelFor(tx.network),
      assetType: token ? 'erc20' : 'native',
      // The backend stores `feeAmount` in the chain's native coin. Anything
      // else would be a lie on the receipt.
      nativeSymbol: nativeSymbolFor(tx.network),
      senderName: sent ? myName : counterpartyName,
      senderTag: sent ? myTag : counterpartyTag,
      beneficiaryName: sent ? counterpartyName : myName,
      beneficiaryTag: sent ? counterpartyTag : myTag,
      timestamp: new Date(tx.createdAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      fee: tx.fee,
      txHash: tx.txHash,
    };
  }, [accountId, profileName, tx]);

  if ((isLoading || loadingDirect) && !tx) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading receipt…</Text>
      </View>
    );
  }

  if (!tx) {
    return (
      <Screen center testID="tx-missing">
        <EmptyState
          icon="alert-circle-outline"
          title="Transaction not found"
          body={loadError ?? 'We could not find that transaction on your account.'}
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="tx-screen">
      <View style={styles.topBar}>
        <BackButton />
        <Typography variant="titleSm" style={styles.screenTitle}>
          Transaction
        </Typography>
        <IconButton
          accessibilityLabel="Copy transaction ID"
          accessibilityHint="Copies the reference for this transaction"
          onPress={handleCopyId}
        >
          <Ionicons name="copy-outline" size={18} color={colors.textPrimary} />
        </IconButton>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View ref={receiptRef} collapsable={false} style={styles.receiptWrapper}>
          {/* Non-null: the `!tx` early return above guarantees it. */}
          <ReceiptCard data={receiptData!} />
        </View>

        <View style={styles.actionContainer}>
          <Button
            label={sharing ? 'Sharing…' : 'Share receipt'}
            onPress={() => void handleShareReceipt()}
            loading={sharing}
            disabled={sharing || saving}
          />
          <Button
            label={saving ? 'Saving…' : 'Save as image'}
            variant="secondary"
            onPress={() => void handleSaveToGallery()}
            loading={saving}
            disabled={sharing || saving}
          />
        </View>

        {notice ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={[
              styles.notice,
              { backgroundColor: notice.tone === 'error' ? colors.errorTint : colors.successTint },
            ]}
          >
            <Ionicons
              name={notice.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
              size={16}
              color={notice.tone === 'error' ? colors.error : colors.success}
            />
            <Typography
              variant="caption"
              color={notice.tone === 'error' ? colors.error : colors.success}
              style={styles.noticeText}
            >
              {notice.text}
            </Typography>
          </View>
        ) : null}

        {tx.txHash ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Copy on-chain transaction hash"
            accessibilityHint="Copies the hash to your clipboard"
            onPress={() => void copyToClipboard(tx.txHash!, 'Transaction hash copied')}
            pressScale={0.98}
            style={[styles.hashRow, { backgroundColor: colors.surfaceElevated }]}
          >
            <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
            <Typography variant="code" numberOfLines={1} style={styles.hashText}>
              {tx.txHash}
            </Typography>
          </Touchable>
        ) : null}
      </ScrollView>

      <CopyToast message={toastMessage ?? ''} visible={toastVisible} />
    </Screen>
  );
}

const getStyles = defineStyles((colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    centerContainer: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    loadingText: { color: colors.textSecondary, marginTop: 12, fontSize: 12 },
    errorSub: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 19 },
    backButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
    },
    backButtonText: { color: colors.textPrimary, fontWeight: '600' },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    circleBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.card,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    screenTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
    receiptWrapper: { width: '100%', marginVertical: 12 },
    actionContainer: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 20 },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: 12,
      borderRadius: 12,
      marginTop: 12,
    },
    noticeText: { flex: 1 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 15,
      borderRadius: 16,
    },
    hashRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 6 },
    hashText: { color: colors.textMuted, fontSize: 11, fontFamily: 'monospace', flex: 1 },
  })
);
