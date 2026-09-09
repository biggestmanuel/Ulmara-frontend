import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { useWalletStore, AssetBalance } from '../../stores/walletStore';
import { useThemeStore } from '../../lib/theme';

export default function BalancesScreen() {
  const { colors, isDark } = useThemeStore();
  const [selectedAsset, setSelectedAsset] = useState<AssetBalance | null>(null);

  const balances = useWalletStore((s) => s.balances);
  const isLoadingBalances = useWalletStore((s) => s.isLoadingBalances);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);

  const handleCopy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isLoadingBalances} onRefresh={refreshBalances} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Multi-Chain Balances</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            7 Decentralized Networks Supported
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {balances.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {isLoadingBalances ? 'Querying on-chain balances...' : 'No balances loaded yet. Pull down to refresh.'}
            </Text>
          ) : (
            balances.map((asset, idx) => (
              <Pressable
                key={asset.id}
                style={[
                  styles.assetRow,
                  idx < balances.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
                onPress={() => setSelectedAsset(asset)}
              >
                <View style={styles.assetLeft}>
                  <View style={[styles.assetBadge, { backgroundColor: isDark ? colors.surfaceElevated : colors.primaryLight }]}>
                    <Text style={[styles.assetBadgeText, { color: colors.primary }]}>{asset.symbol.slice(0, 3)}</Text>
                  </View>
                  <View>
                    <Text style={[styles.assetName, { color: colors.textPrimary }]}>{asset.chainId.toUpperCase()}</Text>
                    <Text style={[styles.assetAddress, { color: colors.textMuted }]}>
                      {asset.address ? `${asset.address.slice(0, 6)}...${asset.address.slice(-4)}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.assetRight}>
                  <Text style={[styles.assetBalance, { color: colors.textPrimary }]}>
                    {Number(asset.balance).toFixed(4)}
                  </Text>
                  <Text style={[styles.assetSymbol, { color: colors.textMuted }]}>{asset.symbol}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* Asset Detail Modal */}
      <Modal visible={!!selectedAsset} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {selectedAsset && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                    {selectedAsset.chainId.toUpperCase()} Details
                  </Text>
                  <Pressable onPress={() => setSelectedAsset(null)} hitSlop={10}>
                    <Text style={[styles.closeIcon, { color: colors.textMuted }]}>✕</Text>
                  </Pressable>
                </View>

                <View style={styles.modalField}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Available Balance</Text>
                  <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>
                    {Number(selectedAsset.balance).toFixed(6)} {selectedAsset.symbol}
                  </Text>
                </View>

                <View style={[styles.addressBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Deposit Address</Text>
                  <Text style={[styles.fullAddress, { color: colors.textPrimary }]} numberOfLines={2}>
                    {selectedAsset.address}
                  </Text>
                  <Pressable
                    style={styles.copyAddressBtn}
                    onPress={() => handleCopy(selectedAsset.address, `${selectedAsset.chainId.toUpperCase()} Address`)}
                  >
                    <Text style={[styles.copyAddressText, { color: colors.primary }]}>Copy Address ❐</Text>
                  </Pressable>
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setSelectedAsset(null);
                      router.push('/receive');
                    }}
                  >
                    <Text style={styles.modalBtnText}>Receive</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => {
                      setSelectedAsset(null);
                      router.push('/send');
                    }}
                  >
                    <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Send</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingVertical: 20 },
  header: { marginBottom: 18 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4 },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  assetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  assetLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assetBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assetBadgeText: { fontSize: 12, fontWeight: '800' },
  assetName: { fontSize: 15, fontWeight: '700' },
  assetAddress: { fontSize: 12, marginTop: 2 },
  assetRight: { alignItems: 'flex-end' },
  assetBalance: { fontSize: 15, fontWeight: '700' },
  assetSymbol: { fontSize: 12, marginTop: 2 },
  emptyText: { padding: 28, textAlign: 'center', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 },
  modalBox: { borderRadius: 24, borderWidth: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  closeIcon: { fontSize: 18, fontWeight: '700' },
  modalField: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  fieldValue: { fontSize: 22, fontWeight: '800' },
  addressBox: { padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  fullAddress: { fontSize: 13, fontFamily: 'monospace', lineHeight: 18 },
  copyAddressBtn: { marginTop: 10, alignSelf: 'flex-start' },
  copyAddressText: { fontSize: 13, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});