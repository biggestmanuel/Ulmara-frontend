import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { useUserStore } from '../../stores/userStore';
import { useThemeStore, ThemeColors } from '../../lib/theme';

// NOTE: swap this placeholder for a real QR renderer, e.g. react-native-qrcode-svg
// <QRCode value={`accountwallet://pay/${accountId}`} size={200} />
// Kept black-on-white regardless of theme, same as a real QR code, for scannability.
function formatAccountId(id: string): string {
  return id.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

const METHODS = ['Account ID', 'QR Code', 'Link'] as const;
type Method = (typeof METHODS)[number];

export default function ReceiveIndex() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  const accountId = useUserStore((state) => state.accountId) ?? '';

  const [method, setMethod] = useState<Method>('QR Code');
  const [copied, setCopied] = useState(false);

  const shareLink = `https://ulmara.app/pay/${accountId}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(method === 'Link' ? shareLink : accountId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
              <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy Account ID'}</Text>
            </Pressable>
          </View>
        )}

        {method === 'Link' && (
          <View style={styles.idCard}>
            <Text style={styles.idLabel}>Shareable Link</Text>
            <Text style={styles.linkValue} numberOfLines={1}>{shareLink}</Text>
            <Pressable style={styles.copyBtn} onPress={handleCopy}>
              <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy Link'}</Text>
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
      width: 220, height: 220, backgroundColor: '#FFFFFF', borderRadius: 20,
      alignItems: 'center', justifyContent: 'center', padding: 16,
    },
    accountId: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 24, letterSpacing: 1 },
    helperText: { color: colors.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' },
    idCard: {
      width: '100%', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
      borderColor: colors.border, padding: 24, alignItems: 'center',
    },
    idLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
    idValue: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', marginTop: 8, letterSpacing: 1 },
    linkValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 8, maxWidth: '100%' },
    copyBtn: {
      marginTop: 18, backgroundColor: colors.border, borderRadius: 10,
      paddingHorizontal: 20, paddingVertical: 10,
    },
    copyBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
    requestBtn: { marginTop: 28 },
    requestBtnText: { color: colors.primaryHover, fontSize: 14, fontWeight: '600' },
    footer: { paddingHorizontal: 20, paddingBottom: 32 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', justifyContent: 'center', height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  });
}
