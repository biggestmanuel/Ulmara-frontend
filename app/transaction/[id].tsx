import React, { useRef, useState } from 'react';
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
import ViewShot from 'react-native-view-shot';

const iconMap: Record<string, string> = {
  'chevron-back': '‹',
  'copy-outline': '⧉',
  'share-social': '↗',
  'download-outline': '⇩',
  'help-circle-outline': '?',
};

function Ionicons({
  name,
  size = 18,
  color = '#FFFFFF',
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <Text
      style={{
        color,
        fontSize: size,
        lineHeight: size,
        fontWeight: '700',
      }}
    >
      {iconMap[name] ?? '•'}
    </Text>
  );
}
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { ReceiptCard, ReceiptData } from '../../components/transaction/ReceiptCard';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const viewShotRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);

  // In production, fetch via your transaction hook or react-query:
  // const { data: tx, isLoading } = useTransaction(id);
  // Using clean standard data for immediate rendering:
  const receiptData: ReceiptData = {
    id: id || 'TX-89241908234',
    type: 'SEND',
    status: 'SUCCESS',
    fiatAmount: '₦125,000.00',
    cryptoAmount: '85.40 USDT',
    senderName: 'Alex Daniels',
    senderTag: '@alex.ulmara',
    beneficiaryName: 'Chioma Okonkwo',
    beneficiaryTag: '@chioma.ulmara',
    timestamp: '10 Sep 2026, 22:45:12',
    network: 'Base Sepolia',
    txHash: '0x8f3c7b912a5d6e4c890123456789abcdef0123456789abcdef0123456789abcd',
  };

  const handleShareReceipt = async () => {
    try {
      setSharing(true);
      if (!viewShotRef.current?.capture) {
        throw new Error('Capture reference unavailable');
      }
      const uri = await viewShotRef.current.capture();
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Ulmara Receipt - ${receiptData.id}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      }
    } catch (err) {
      Alert.alert('Share Failed', 'Unable to capture and export receipt image.');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyId = async () => {
    await Clipboard.setStringAsync(receiptData.id);
    Alert.alert('Copied', 'Transaction reference copied to clipboard.');
  };

  return (
    <View style={styles.screen}>
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.circleBtn}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Transaction Details</Text>
        <TouchableOpacity
          onPress={handleCopyId}
          style={styles.circleBtn}
          accessibilityLabel="Copy Transaction ID"
        >
          <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Render Card inside ViewShot for high-res image sharing */}
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1.0, result: 'tmpfile' }}
          style={styles.viewShotContainer}
        >
          <ReceiptCard data={receiptData} />
        </ViewShot>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShareReceipt}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <Ionicons name="share-social" size={18} color="#000000" />
                <Text style={styles.shareBtnText}>Share Receipt</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={handleShareReceipt}
          >
            <Ionicons name="download-outline" size={18} color="#FFFFFF" />
            <Text style={styles.downloadBtnText}>Save Image</Text>
          </TouchableOpacity>
        </View>

        {/* Need Help link */}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#000000',
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  viewShotContainer: {
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
    backgroundColor: '#F0784B',
    paddingVertical: 14,
    borderRadius: 14,
  },
  shareBtnText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  downloadBtnText: {
    color: '#FFFFFF',
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
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    fontWeight: '500',
  },
});