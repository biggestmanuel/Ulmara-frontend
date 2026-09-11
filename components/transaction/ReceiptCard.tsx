import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';

export interface ReceiptData {
  id: string;
  type: 'SEND' | 'RECEIVE' | 'FIAT_DEPOSIT' | 'FIAT_WITHDRAWAL';
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  fiatAmount: string; // e.g. "₦125,000.00"
  cryptoAmount?: string; // e.g. "85.40 USDT"
  senderName: string;
  senderTag?: string; // e.g. "@alex.ulmara"
  beneficiaryName: string;
  beneficiaryTag?: string; // e.g. "@chioma.ulmara"
  timestamp: string; // e.g. "10 Sep 2026, 22:45:12"
  network?: string; // e.g. "Base Sepolia" or "NIBSS Instant"
  txHash?: string; // on-chain hash or bank ref
}

interface Props {
  data: ReceiptData;
  style?: ViewStyle;
}

export const ReceiptCard: React.FC<Props> = ({ data, style }) => {
  const isSuccess = data.status === 'SUCCESS';

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

        <View style={styles.statusBadge}>
          <Ionicons
            name={isSuccess ? 'checkmark-circle' : 'time-outline'}
            size={14}
            color={isSuccess ? '#10B981' : '#F59E0B'}
          />
          <Text
            style={[
              styles.statusText,
              { color: isSuccess ? '#10B981' : '#F59E0B' },
            ]}
          >
            {data.status}
          </Text>
        </View>
      </View>

      {/* Primary Amount Display */}
      <View style={styles.amountContainer}>
        <Text style={styles.amountLabel}>Total Amount Transferred</Text>
        <Text style={styles.fiatAmount}>{data.fiatAmount}</Text>
        {data.cryptoAmount ? (
          <View style={styles.cryptoPill}>
            <Text style={styles.cryptoText}>{data.cryptoAmount}</Text>
            {data.network ? (
              <Text style={styles.networkTag}> • {data.network}</Text>
            ) : null}
          </View>
        ) : null}
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
            <Text style={styles.partyTag}>{data.senderTag}</Text>
          ) : null}
        </View>

        {/* Transfer Connector */}
        <View style={styles.flowBridge}>
          <View style={styles.bridgeLine} />
          <View style={styles.bridgeIcon}>
            <Ionicons name="arrow-forward" size={14} color="#F0784B" />
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
            <Text style={styles.partyTag}>{data.beneficiaryTag}</Text>
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
          <Text style={styles.metaLabel}>Transaction Ref</Text>
          <Text style={[styles.metaValue, styles.mono]} numberOfLines={1}>
            {data.id}
          </Text>
        </View>

        {data.txHash ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Proof / Hash</Text>
            <Text style={[styles.metaValue, styles.mono]} numberOfLines={1}>
              {data.txHash.slice(0, 10)}...{data.txHash.slice(-8)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* QR Code & Verification Footer */}
      <View style={styles.footer}>
        <View style={styles.qrWrapper}>
          <QRCode
            value={`https://ulmara.fi/tx/${data.id}`}
            size={56}
            color="#000000"
            backgroundColor="#FFFFFF"
          />
        </View>
        <View style={styles.footerInfo}>
          <Text style={styles.footerHeader}>Official Digital Receipt</Text>
          <Text style={styles.footerNotice}>
            Scan to inspect transaction status directly on Ulmara or the target
            ledger.
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
    borderColor: 'rgba(240, 120, 75, 0.35)',
    padding: 24,
    width: '100%',
    shadowColor: '#F0784B',
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
    backgroundColor: '#F0784B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    backgroundColor: '#F0784B',
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
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
  fiatAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  cryptoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240, 120, 75, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(240, 120, 75, 0.25)',
  },
  cryptoText: {
    color: '#F0784B',
    fontSize: 12,
    fontWeight: '700',
  },
  networkTag: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
  },
  circuitDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 6,
  },
  circuitDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F0784B',
  },
  circuitLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(240, 120, 75, 0.3)',
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
    color: '#F0784B',
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
    backgroundColor: 'rgba(240, 120, 75, 0.4)',
  },
  bridgeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(240, 120, 75, 0.15)',
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
    maxWidth: '55%',
  },
  mono: {
    fontFamily: 'monospace',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
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