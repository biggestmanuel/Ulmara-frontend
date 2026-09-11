import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';

import { useTxStore } from '../../stores/txStore';
import { useUserStore } from '../../stores/userStore';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { fetchTransactionById, Transaction } from '../../lib/api/transactions';
import { ReceiptCard, ReceiptData } from '../../components/transaction/ReceiptCard';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const receiptRef = useRef<View>(null);

  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fallbackTx, setFallbackTx] = useState<Transaction | null>(null);
  const [loadingDirect, setLoadingDirect] = useState(false);

  // 1. User Store
  const { accountId, profile } = useUserStore();
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

  // 2. Tx Store
  const { items, isLoading, fetchInitial } = useTxStore();

  // Try finding in current items
  const storeTx = items.find((item) => item.id === id);

  // 3. Fallback: If not in local items (e.g. direct link or refresh), fetch by ID
  useEffect(() => {
    if (!storeTx && id) {
      setLoadingDirect(true);
      fetchTransactionById(id)
        .then((data) => setFallbackTx(data))
        .catch((err) => {
          console.error('Failed to fetch transaction by id:', err);
          // Also trigger list fetch just in case
          fetchInitial();
        })
        .finally(() => setLoadingDirect(false));
    }
  }, [id, storeTx]);

  const tx = storeTx || fallbackTx;

  // Capture helper
  const captureReceiptUri = async (): Promise<string> => {
    if (!receiptRef.current) {
      throw new Error('Receipt view reference is not ready');
    }
    return await captureRef(receiptRef, {
      format: 'png',
      quality: 1.0,
    });
  };

  // Real Share
  const handleShareReceipt = async () => {
    try {
      setSharing(true);
      const uri = await captureReceiptUri();
      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Ulmara Receipt - ${id}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'Native sharing is not supported on this device.');
      }
    } catch (err: any) {
      Alert.alert('Share Failed', err?.message || 'Unable to share receipt.');
    } finally {
      setSharing(false);
    }
  };

  // Real Save to Gallery
  const handleSaveToGallery = async () => {
    try {
      setSaving(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow media access in your settings to save receipts to your photos.'
        );
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
      } catch (albumErr) {
        // Fallback: asset is safely in camera roll
      }

      Alert.alert('Saved!', 'Receipt saved to your Photos/Gallery.');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Unable to save receipt image.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyId = async () => {
    if (id) {
      await Clipboard.setStringAsync(id);
      Alert.alert('Copied', 'Transaction ID copied to clipboard.');
    }
  };

  // Loading state
  if ((isLoading || loadingDirect) && !tx) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading receipt...</Text>
      </View>
    );
  }

  // Not found state
  if (!tx) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorTitle}>Transaction Not Found</Text>
        <Text style={styles.errorSub}>The transaction reference could not be found.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Build 100% accurate dynamic ReceiptData matching lib/api/transactions.ts
  const isSent = tx.direction === 'sent';
  const myName = profile?.name || 'You';
  const myTag = accountId ? `@${accountId}` : undefined;
  const counterpartyTag = tx.counterpartyAccountId ? `@${tx.counterpartyAccountId}` : undefined;
  const counterpartyName = tx.counterpartyAccountId || 'External Account';

  const receiptData: ReceiptData = {
    id: tx.id,
    direction: tx.direction,
    status: tx.status,
    amount: tx.amount,
    symbol: tx.symbol,
    network: tx.network,
    senderName: isSent ? myName : counterpartyName,
    senderTag: isSent ? myTag : counterpartyTag,
    beneficiaryName: isSent ? counterpartyName : myName,
    beneficiaryTag: isSent ? counterpartyTag : myTag,
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

  return (
    <View style={styles.screen}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.circleBtn}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Transaction Details</Text>
        <TouchableOpacity
          onPress={handleCopyId}
          style={styles.circleBtn}
          accessibilityLabel="Copy Transaction ID"
        >
          <Ionicons name="copy-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View ref={receiptRef} collapsable={false} style={styles.receiptWrapper}>
          <ReceiptCard data={receiptData} />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShareReceipt}
            disabled={sharing || saving}
          >
            {sharing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="share-social" size={18} color="#FFFFFF" />
                <Text style={styles.shareBtnText}>Share Receipt</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleSaveToGallery}
            disabled={sharing || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.downloadBtnText}>Save Image</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.supportRow}
          onPress={() => Alert.alert('Support', 'Contacting Ulmara 24/7 Support...')}
        >
          <Ionicons name="help-circle-outline" size={16} color="rgba(255, 255, 255, 0.45)" />
          <Text style={styles.supportText}>Need help with this transaction?</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  errorSub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
  },
  backButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
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
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  receiptWrapper: {
    width: '100%',
    marginVertical: 12,
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 20,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  downloadBtnText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingVertical: 8,
  },
  supportText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  });
}