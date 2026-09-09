import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { useUserStore } from '../../stores/userStore';
import { useThemeStore } from '../../lib/theme';

function formatAccountId(id?: string | null): string {
  if (!id) return '---- --- ---';
  return id.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}

export default function ProfileScreen() {
  const { colors, isDark } = useThemeStore();
  const accountId = useUserStore((s) => s.accountId);
  const profile = useUserStore((s) => s.profile);
  const logout = useUserStore((s) => s.logout);

  const displayName = profile?.name?.trim() || 'Biggest Manuel';
  const email = profile?.email || 'user@ulmara.io';
  const initial = displayName.charAt(0).toUpperCase();

  const handleCopyId = async () => {
    if (accountId) {
      await Clipboard.setStringAsync(accountId);
      Alert.alert('Copied', 'Account ID copied to clipboard');
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of Ulmara?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.screenHeading, { color: colors.textPrimary }]}>Profile</Text>

        {/* User Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatarBig, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarBigText}>{initial}</Text>
          </View>
          <Text style={[styles.profileName, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{email}</Text>

          {/* Account ID Pill */}
          <Pressable
            style={[styles.idCardPill, { backgroundColor: isDark ? colors.surfaceElevated : colors.primaryLight }]}
            onPress={handleCopyId}
          >
            <Text style={[styles.idCardPillText, { color: colors.primary }]}>
              ID: {formatAccountId(accountId)} ❐
            </Text>
          </Pressable>
        </View>

        {/* Menu Items */}
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={styles.menuRow}
            onPress={() => router.push('/settings' as any)}
          >
            <View style={styles.menuLeft}>
              <Text style={{ fontSize: 18 }}>⚙️</Text>
              <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>Settings</Text>
            </View>
            <Text style={[styles.arrow, { color: colors.textMuted }]}>→</Text>
          </Pressable>
        </View>

        {/* Log out */}
        <Pressable
          style={[styles.logoutBtn, { borderColor: colors.error }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingVertical: 20 },
  screenHeading: { fontSize: 24, fontWeight: '800', marginBottom: 18 },
  profileCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarBig: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarBigText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  profileName: { fontSize: 18, fontWeight: '800' },
  profileEmail: { fontSize: 13, marginTop: 4 },
  idCardPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 14,
  },
  idCardPillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  menuCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuLabel: { fontSize: 15, fontWeight: '700' },
  arrow: { fontSize: 16, fontWeight: '700' },
  logoutBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '800' },
});