import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useUserStore } from '../../stores/userStore';
import { useThemeStore, ThemeColors } from '../../lib/theme';
import { formatAccountId } from '../../lib/format';
import { useCopyToast, CopyToast } from '../../components/ui/CopyToast';

// NOTE: swap this placeholder for a real QR renderer, e.g. react-native-qrcode-svg
// <QRCode value={`accountwallet://pay/${accountId}`} size={200} />
// Kept black-on-white regardless of theme, same as a real QR code, for scannability.

const METHODS = ['Account ID', 'QR Code', 'Link'] as const;
type Method = (typeof METHODS)[number];

export default function ReceiveIndex() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const accountId = useUserStore((state) => state.accountId) ?? '';

  const [method, setMethod] = useState<Method>('QR Code');
  const { copyToClipboard, message: toastMessage, visible: toastVisible } = useCopyToast();

  const shareLink = `https://ulmara.app/pay/${accountId}`;

  const handleCopy = async () => {
    await copyToClipboard(
      method === 'Link' ? shareLink : accountId,
      method === 'Link' ? 'Payment link copied to clipboard' : 'Account ID copied to clipboard'
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Send me crypto via my Account ID: ${formatAccountId(accountId)}\n${shareLink}`,
      });
    } catch {
      // user cancelled or share failed silently
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Receive</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.methodRow}>
        {METHODS.map((m) => (
          <Pressable
            key={m}
            style={[styles.methodChip, method === m && styles.methodChipActive]}
            onPress={() => setMethod(m)}
          >
            <Text style={[styles.methodText, method === m && styles.methodTextActive]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {method === 'QR Code' && (
          <>
            <View style={styles.qrBox}><QRCode value={shareLink} size={180} /></View>
            <Text style={styles.accountId}>{formatAccountId(accountId)}</Text>
            <Text style={styles.helperText}>Scan to send crypto directly to this account</Text>
          </>
        )}

        {method === 'Account ID' && (
          <View style={styles.idCard}>
            <Text style={styles.idLabel}>Your Account ID</Text>
            <Text style={styles.idValue}>{formatAccountId(accountId)}</Text>
            <Pressable style={styles.copyBtn} onPress={handleCopy}>
              <Text style={styles.copyBtnText}>Copy Account ID</Text>
            </Pressable>
          </View>
        )}

        {method === 'Link' && (
          <View style={styles.idCard}>
            <Text style={styles.idLabel}>Shareable Link</Text>
            <Text style={styles.linkValue} numberOfLines={1}>{shareLink}</Text>
            <Pressable style={styles.copyBtn} onPress={handleCopy}>
              <Text style={styles.copyBtnText}>Copy Link</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={styles.requestBtn}
          onPress={() => router.push('/receive/payment-request')}
        >
          <Text style={styles.requestBtnText}>Request a specific amount</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={handleShare}>
          <Text style={styles.primaryBtnText}>Share</Text>
        </Pressable>
      </View>

      {/* Copy confirmation — styled to match the app's modal design */}
      <CopyToast message={toastMessage ?? ''} visible={toastVisible} onHide={() => {}} />
    </SafeAreaView>
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
    methodRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 4 },
    methodChip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    methodText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    methodTextActive: { color: '#FFFFFF' },
    body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 28 },
    qrBox: {
      width: 220,
      height: 220,
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    },
    accountId: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 24, letterSpacing: 1 },
    helperText: { color: colors.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' },
    idCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: 'center',
    },
    idLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    idValue: { color: colors.textPrimary, fontSize: 26, fontWeight: '800', marginTop: 8, letterSpacing: 1 },
    linkValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 8, maxWidth: '100%' },
    copyBtn: {
      marginTop: 18,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    copyBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    requestBtn: { marginTop: 28 },
    requestBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    footer: { paddingHorizontal: 20, paddingBottom: 32 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });
}
