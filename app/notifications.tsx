import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useThemeStore } from '../lib/theme';

export default function NotificationsScreen() {
  const { colors } = useThemeStore();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={[styles.back, { color: colors.textPrimary }]}>‹</Text></Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.empty}>
        <Bell size={42} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No notifications yet</Text>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>Notifications will appear here when they are available.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  back: { fontSize: 28 },
  title: { fontSize: 18, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptyText: { textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
