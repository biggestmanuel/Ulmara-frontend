import { View, Text, StyleSheet, Pressable, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { usePreferencesStore, type NotificationPrefs } from '../../stores/preferencesStore';

export default function Notifications() {
  const prefs = usePreferencesStore((s) => s.notifications);
  const setNotification = usePreferencesStore((s) => s.setNotification);

  const toggle = (key: keyof NotificationPrefs) => setNotification(key, !prefs[key]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Transaction Updates"
            desc="Sent, received, deposit, and withdrawal status"
            value={prefs.pushTransactions}
            onChange={() => toggle('pushTransactions')}
          />
          <ToggleRow
            label="Security Alerts"
            desc="New device logins and PIN changes"
            value={prefs.pushSecurity}
            onChange={() => toggle('pushSecurity')}
          />
          <ToggleRow
            label="Price Alerts"
            desc="Significant market moves on your assets"
            value={prefs.pushPriceAlerts}
            onChange={() => toggle('pushPriceAlerts')}
            last
          />
        </View>
        <Text style={styles.footNote}>
          Push delivery isn't wired up server-side yet — these choices are saved and will take
          effect once notification infrastructure ships.
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Email</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Transaction Receipts"
            desc="Email a receipt after every transaction"
            value={prefs.emailReceipts}
            onChange={() => toggle('emailReceipts')}
          />
          <ToggleRow
            label="Product Updates"
            desc="New features and announcements"
            value={prefs.emailProduct}
            onChange={() => toggle('emailProduct')}
            last
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  label, desc, value, onChange, last,
}: { label: string; desc: string; value: boolean; onChange: () => void; last?: boolean }) {
  return (
    <View style={[styles.toggleRow, last && styles.toggleRowLast]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#26262E', true: '#6C5CE7' }}
        thumbColor="#FFFFFF"
      />
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
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  sectionTitle: { color: '#9A9AA5', fontSize: 13, fontWeight: '500', marginBottom: 10 },
  footNote: { color: '#5C5C66', fontSize: 11, marginTop: 8, marginBottom: 24, lineHeight: 16 },
  card: {
    backgroundColor: '#17171D', borderRadius: 14, borderWidth: 1, borderColor: '#26262E',
    overflow: 'hidden', marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1D1D24',
  },
  toggleRowLast: { borderBottomWidth: 0 },
  toggleLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  toggleDesc: { color: '#9A9AA5', fontSize: 12, marginTop: 3 },
});
