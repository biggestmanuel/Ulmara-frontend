import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeMode } from '../../lib/theme';
import { getEvmMnemonic, getSolMnemonic, getTonMnemonic } from '../../lib/storage/secureStorage';

export default function SettingsScreen() {
  const { colors, mode, setMode } = useThemeStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seeds, setSeeds] = useState<{ evm: string; sol: string; ton: string[] } | null>(null);

  const handleViewSeeds = async () => {
    try {
      const evm = (await getEvmMnemonic()) || 'Not available';
      const sol = (await getSolMnemonic()) || 'Not available';
      const ton = (await getTonMnemonic()) || [];
      setSeeds({ evm, sol, ton });
      setShowSeedModal(true);
    } catch {
      Alert.alert('Error', 'Could not access secure storage');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.backText, { color: colors.primary }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Appearance / Theme */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>THEME PREFERENCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(['dark', 'light', 'system'] as ThemeMode[]).map((themeOpt, idx) => (
            <Pressable
              key={themeOpt}
              style={[
                styles.row,
                idx < 2 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
              ]}
              onPress={() => setMode(themeOpt)}
            >
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>
                {themeOpt === 'dark' ? 'Dark Theme' : themeOpt === 'light' ? 'Light Theme' : 'System Default'}
              </Text>
              <View style={[styles.radio, { borderColor: colors.primary }]}>
                {mode === themeOpt && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>Push Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* Security */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SECURITY & BACKUP</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
            onPress={() => router.push('/(auth)/verify-pin')}
          >
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>Change 6-Digit PIN</Text>
            <Text style={[styles.rowArrow, { color: colors.textMuted }]}>→</Text>
          </Pressable>

          <Pressable style={styles.row} onPress={handleViewSeeds}>
            <Text style={[styles.rowText, { color: colors.primary }]}>View Recovery Phrases</Text>
            <Text style={[styles.rowArrow, { color: colors.primary }]}>🔒</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Seed Phrase Backup Modal */}
      <Modal visible={showSeedModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Recovery Phrases</Text>
            <Text style={[styles.modalWarning, { color: colors.error }]}>
              ⚠️ Never share these phrases with anyone! Anyone with these words can steal your assets.
            </Text>

            <ScrollView style={{ maxHeight: 300 }}>
              {seeds && (
                <>
                  <Text style={[styles.seedHeading, { color: colors.primary }]}>EVM & TRON (12 Words)</Text>
                  <Text style={[styles.seedText, { color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}>
                    {seeds.evm}
                  </Text>

                  <Text style={[styles.seedHeading, { color: colors.primary }]}>Solana (12 Words)</Text>
                  <Text style={[styles.seedText, { color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}>
                    {seeds.sol}
                  </Text>

                  <Text style={[styles.seedHeading, { color: colors.primary }]}>TON (24 Words)</Text>
                  <Text style={[styles.seedText, { color: colors.textPrimary, backgroundColor: colors.surfaceElevated }]}>
                    {seeds.ton.join(' ')}
                  </Text>
                </>
              )}
            </ScrollView>

            <Pressable
              style={[styles.closeModalBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowSeedModal(false)}
            >
              <Text style={styles.closeModalBtnText}>I Have Backed Them Up</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backText: { fontSize: 16, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  scroll: { padding: 18 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 14 },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowText: { fontSize: 15, fontWeight: '700' },
  rowArrow: { fontSize: 16, fontWeight: '700' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalBox: { borderRadius: 24, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  modalWarning: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  seedHeading: { fontSize: 13, fontWeight: '800', marginTop: 10, marginBottom: 4 },
  seedText: { padding: 12, borderRadius: 12, fontSize: 13, lineHeight: 20, fontFamily: 'monospace' },
  closeModalBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  closeModalBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});