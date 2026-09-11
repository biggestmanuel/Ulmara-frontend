import { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Share, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ReceiptCard } from '../../components/transaction/ReceiptCard';

// Requires:
//   npm install react-native-view-shot
//   npx expo install expo-sharing

// TODO: replace with stores/txStore + lib/api/transactions lookup by id
type TxDetail = {
  id: string;
  type: 'sent' | 'received' | 'deposit' | 'withdraw';
  counterparty: string;
  amount: string;
  asset: string;
  network: string;
  fee: string;
  txHash: string;
  time: string;
  status: 'complete' | 'processing' | 'failed';
};

const MOCK_TX_DB: Record<string, TxDetail> = {
  '1': {
    id: '1', type: 'received', counterparty: '7729 104 552', amount: '+120.00', asset: 'USDT',
    network: 'TON', fee: '0.02 USDT', txHash: 'EQD4FPq-...9d21', time: 'Today, 2:14 PM', status: 'complete',
  },
  '2': {
    id: '2', type: 'sent', counterparty: '0192 883 210', amount: '-45.00', asset: 'USDT',
    network: 'BSC', fee: '0.15 USDT', txHash: '0x8f3Cc2...4b19', time: 'Yesterday, 6:40 PM', status: 'complete',
  },
  '3': {
    id: '3', type: 'deposit', counterparty: 'Bank Deposit', amount: '+50,000.00', asset: 'NGN',
    network: 'Paystack', fee: 'Free', txHash: 'DEP-88231940', time: '2 days ago, 11:02 AM', status: 'complete',
  },
  '4': {
    id: '4', type: 'sent', counterparty: '5510 992 034', amount: '-0.05', asset: 'ETH',
    network: 'ETH', fee: '2.80 USD', txHash: '0x9aB1c4...7f02', time: '3 days ago, 9:18 AM', status: 'processing',
  },
  '5': {
    id: '5', type: 'withdraw', counterparty: 'Bank Withdrawal', amount: '-20,000.00', asset: 'NGN',
    network: 'Paystack', fee: 'Free', txHash: 'WDL-77201853', time: '5 days ago, 3:55 PM', status: 'complete',
  },
};

function statusColor(status: TxDetail['status']) {
  if (status === 'complete') return '#4CD97B';
  if (status === 'processing') return '#E8B84B';
  return '#FF6B6B';
}

function statusLabel(status: TxDetail['status']) {
  if (status === 'complete') return 'Complete';
  if (status === 'processing') return 'Processing';
  return 'Failed';
}

function txTitle(tx: TxDetail): string {
  if (tx.type === 'deposit' || tx.type === 'withdraw') return tx.counterparty;
  return tx.type === 'sent' ? `Sent to ${tx.counterparty}` : `Received from ${tx.counterparty}`;
}

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useMemo(() => MOCK_TX_DB[id] ?? null, [id]);
  const receiptRef = useRef<ViewShot>(null);

  const handleShare = async () => {
    if (!tx) return;
    try {
      // Capture the hidden ReceiptCard as a PNG and share that image,
      // instead of the old plain-text message — a proper shareable receipt.
      const uri = await receiptRef.current?.capture?.();
      if (!uri) return;

      if (Platform.OS === 'web') {
        await Share.share({ url: uri, message: txTitle(tx) });
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share receipt' });
      } else {
        await Share.share({ url: uri });
      }
    } catch (err) {
      console.error('Failed to share receipt image:', err);
    }
  };

  if (!tx) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Transaction</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Transaction not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPositive = tx.amount.startsWith('+');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Transaction</Text>
        <Pressable onPress={handleShare}>
          <Text style={styles.shareIcon}>↗</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statusIconWrap}>
          <Text style={styles.statusIcon}>
            {tx.type === 'sent' || tx.type === 'withdraw' ? '↑' : '↓'}
          </Text>
        </View>

        <Text style={[styles.amount, isPositive && styles.amountPositive]}>
          {tx.amount} {tx.asset}
        </Text>
        <Text style={styles.title}>{txTitle(tx)}</Text>

        <View style={[styles.statusPill, { borderColor: statusColor(tx.status) }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(tx.status) }]} />
          <Text style={[styles.statusText, { color: statusColor(tx.status) }]}>{statusLabel(tx.status)}</Text>
        </View>

        <View style={styles.detailsCard}>
          <DetailRow label="Network" value={tx.network} />
          <DetailRow label="Network Fee" value={tx.fee} />
          <DetailRow label="Date & Time" value={tx.time} />
          <DetailRow label="Reference / Tx ID" value={tx.txHash} mono />
        </View>
      </ScrollView>

      {/* Off-screen receipt used only for image capture — not visible to the user. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={receiptRef} options={{ format: 'png', quality: 1 }}>
          <View style={styles.receiptWrap}>
            <ReceiptCard
              amount={tx.amount}
              symbol={tx.asset}
              recipient={tx.counterparty}
              network={tx.network}
              fee={tx.fee}
              txId={tx.txHash}
            />
          </View>
        </ViewShot>
      </View>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  back: { color: '#FFFFFF', fontSize: 28 },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  shareIcon: { color: '#8C7AFF', fontSize: 20, fontWeight: '700' },
  body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  statusIconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#17171D',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  statusIcon: { color: '#D0D0D6', fontSize: 24, fontWeight: '700' },
  amount: { color: '#FFFFFF', fontSize: 30, fontWeight: '700' },
  amountPositive: { color: '#4CD97B' },
  title: { color: '#9A9AA5', fontSize: 14, marginTop: 6 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 16,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  detailsCard: {
    width: '100%', backgroundColor: '#17171D', borderRadius: 16, borderWidth: 1,
    borderColor: '#26262E', padding: 18, marginTop: 28,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1D1D24',
  },
  detailLabel: { color: '#9A9AA5', fontSize: 14 },
  detailValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', maxWidth: '55%' },
  mono: { fontSize: 13 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: '#5C5C66', fontSize: 14 },
  offscreen: { position: 'absolute', top: -9999, left: -9999 },
  receiptWrap: { width: 320, backgroundColor: '#0B0B0F', padding: 20 },
});
