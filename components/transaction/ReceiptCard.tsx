import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import type { TransactionDirection, TransactionStatus } from '../../lib/api/transactions';

export interface ReceiptData {
  id: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  amount: string;
  symbol: string;
  network: string;
  senderName: string;
  senderTag?: string;
  beneficiaryName: string;
  beneficiaryTag?: string;
  timestamp: string;
  fee?: string;
  txHash?: string | null;
}

interface Props {
  data: ReceiptData;
  style?: ViewStyle;
}

export const ReceiptCard: React.FC<Props> = ({ data, style }) => {
  const isComplete = data.status === 'complete';
  const isProcessing = data.status === 'processing';

  const statusColor = isComplete ? '#10B981' : isProcessing ? '#F59E0B' : '#EF4444';
  const statusIcon = isComplete ? 'checkmark-circle' : isProcessing ? 'time-outline' : 'close-circle';

  return (
    <View style={[styles.card, style]}>
      {/* Top Accent Glowing Circuit Line */}
      <View style={styles.topAccentBar} />

      {/* Header / Brand */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>U</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>ULMARA</Text>
            <Text style={styles.brandSub}>TRANSACTION RECEIPT</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { borderColor: `${statusColor}40` }]}>
          <Ionicons name={statusIcon} size={14} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {data.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Primary Amount Display */}
      <View style={styles.amountContainer}>
        <Text style={styles.amountLabel}>
          {data.direction === 'sent' ? 'Total Amount Sent' : 'Total Amount Received'}
        </Text>
        <Text style={styles.cryptoAmount}>
          {data.amount} {data.symbol}
        </Text>
        
        <View style={styles.networkPill}>
          <Text style={styles.networkTag}>{data.network.toUpperCase()}</Text>
        </View>
      </View>

      {/* Circuit Line Divider */}
      <View style={styles.circuitDivider}>
        <View style={styles.circuitDot} />
        <View style={styles.circuitLine} />
        <View style={styles.circuitDot} />
      </View>

      {/* Transfer Flow (Sender -> Bridge -> Beneficiary) */}
      <View style={styles.flowContainer}>
        {/* Sender */}
        <View style={styles.flowParty}>
          <Text style={styles.partyRole}>SENDER</Text>
          <Text style={styles.partyName} numberOfLines={1}>
            {data.senderName}
          </Text>
          {data.senderTag ? (
            <Text style={styles.partyTag} numberOfLines={1}>
              {data.senderTag}
            </Text>
          ) : null}
        </View>

        {/* Transfer Connector */}
        <View style={styles.flowBridge}>
          <View style={styles.bridgeLine} />
          <View style={styles.bridgeIcon}>
            <Ionicons name="arrow-forward" size={14} color="#14B8A6" />
          </View>
          <View style={styles.bridgeLine} />
        </View>

        {/* Beneficiary */}
        <View style={[styles.flowParty, { alignItems: 'flex-end' }]}>
          <Text style={styles.partyRole}>BENEFICIARY</Text>
          <Text style={styles.partyName} numberOfLines={1}>
            {data.beneficiaryName}
          </Text>
          {data.beneficiaryTag ? (
            <Text style={styles.partyTag} numberOfLines={1}>
              {data.beneficiaryTag}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Metadata Rows */}
      <View style={styles.metaList}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date & Time</Text>
          <Text style={styles.metaValue}>{data.timestamp}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Transaction ID</Text>
          <Text style={[styles.metaValue, styles.mono]} numberOfLines={1}>
            {data.id}
          </Text>
        </View>

        {data.fee ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Network Fee</Text>
            <Text style={styles.metaValue}>
              {data.fee} {data.symbol}
            </Text>
          </View>
        ) : null}

        {data.txHash ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>On-Chain Hash</Text>
            <Text style={[styles.metaValue, styles.mono]} numberOfLines={1}>
              {data.txHash.length > 20 
                ? `${data.txHash.slice(0, 8)}...${data.txHash.slice(-8)}`
                : data.txHash}
            </Text>
          </View>
        ) : null}
      </View>

      {/* QR Code & Verification Footer */}
      <View style={styles.footer}>
        <View style={styles.qrWrapper}>
          <QRCode
            value={data.txHash ? `https://ulmara.fi/tx/${data.txHash}` : `https://ulmara.fi/tx/${data.id}`}
            size={56}
            color="#000000"
            backgroundColor="#FFFFFF"
          />
        </View>
        <View style={styles.footerInfo}>
          <Text style={styles.footerHeader}>Official Digital Receipt</Text>
          <Text style={styles.footerNotice}>
            Scan to inspect transaction proof on Ulmara or the underlying network.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0A0A0E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(20, 184, 166, 0.35)',
    padding: 22,
    width: '100%',
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  topAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#14B8A6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#14B8A6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '900',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  brandSub: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  amountContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  amountLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
    marginBottom: 6,
  },
  cryptoAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(20, 184, 166, 0.25)',
  },
  networkTag: {
    color: '#14B8A6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  circuitDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 6,
  },
  circuitDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#14B8A6',
  },
  circuitLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(20, 184, 166, 0.3)',
  },
  flowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  flowParty: {
    flex: 1,
  },
  partyRole: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  partyName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  partyTag: {
    fontSize: 11,
    color: '#14B8A6',
    fontWeight: '600',
    marginTop: 2,
  },
  flowBridge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  bridgeLine: {
    width: 14,
    height: 1,
    backgroundColor: 'rgba(20, 184, 166, 0.4)',
  },
  bridgeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaList: {
    marginTop: 18,
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
    maxWidth: '58%',
  },
  mono: {
    fontFamily: 'monospace',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 14,
  },
  qrWrapper: {
    padding: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  footerInfo: {
    flex: 1,
  },
  footerHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  footerNotice: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    lineHeight: 14,
  },
});