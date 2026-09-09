import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUserStore } from '../../stores/userStore';

const MENU_ITEMS = [
  { label: 'Security', route: '/settings/security' },
  { label: 'Notifications', route: '/settings/notifications' },
  { label: 'Preferences', route: '/settings/preferences' },
] as const;

export default function Profile() {
  const accountId = useUserStore((s) => s.accountId);
  const profile = useUserStore((s) => s.profile);
  const logout = useUserStore((s) => s.logout);

  const displayName = profile?.name?.trim() || 'Ulmara User';
  const email = profile?.email ?? '';
  const initial = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          // logout() clears SecureStore (token + account id) and resets
          // pinVerified — this is what actually ends the session, unlike
          // a plain navigation which left the token in place and let
          // _layout.tsx's redirect bounce you straight back in.
          await logout();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Profile</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName}</Text>
            {!!email && <Text style={styles.email}>{email}</Text>}
          </View>
        </View>

        <View style={styles.idCard}>
          <Text style={styles.idLabel}>Account ID</Text>
          <Text style={styles.idValue}>{accountId ?? '—'}</Text>
        </View>

        <View style={styles.menu}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              style={styles.menuRow}
              onPress={() => router.push(item.route as any)}
            >
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', marginBottom: 20 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#17171D', borderRadius: 16, borderWidth: 1, borderColor: '#26262E',
    padding: 18, marginBottom: 16,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#6C5CE7',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 20 },
  name: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  email: { color: '#9A9AA5', fontSize: 13, marginTop: 2 },
  idCard: {
    backgroundColor: '#17171D', borderRadius: 16, borderWidth: 1, borderColor: '#26262E',
    padding: 18, marginBottom: 24,
  },
  idLabel: { color: '#9A9AA5', fontSize: 12, fontWeight: '500' },
  idValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
  menu: {
    backgroundColor: '#17171D', borderRadius: 16, borderWidth: 1, borderColor: '#26262E',
    marginBottom: 24, overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1D1D24',
  },
  menuLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  chevron: { color: '#5C5C66', fontSize: 20 },
  logoutBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#3A2020', backgroundColor: '#1A1212',
  },
  logoutText: { color: '#FF6B6B', fontSize: 15, fontWeight: '600' },
});
