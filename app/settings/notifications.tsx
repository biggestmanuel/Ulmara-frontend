import { View, Text, StyleSheet, Pressable, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { usePreferencesStore, type NotificationPrefs } from '../../stores/preferencesStore';
import { useThemeStore, ThemeColors } from '../../lib/theme';

export default function Notifications() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);

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
            styles={styles}
            colors={colors}
            label="Transaction Updates"
            desc="Sent, received, deposit, and withdrawal status"
            value={prefs.pushTransactions}
            onChange={() => toggle('pushTransactions')}
          />
          <ToggleRow
            styles={styles}
            colors={colors}
            label="Security Alerts"
            desc="New device logins and PIN changes"
            value={prefs.pushSecurity}
            onChange={() => toggle('pushSecurity')}
          />
          <ToggleRow
            styles={styles}
            colors={colors}
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
            styles={styles}
            colors={colors}
            label="Transaction Receipts"
            desc="Email a receipt after every transaction"
            value={prefs.emailReceipts}
            onChange={() => toggle('emailReceipts')}
          />
          <ToggleRow
            styles={styles}
            colors={colors}
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
  styles, colors, label, desc, value, onChange, last,
}: {
  styles: ReturnType<typeof getStyles>; colors: ThemeColors;
  label: string; desc: string; value: boolean; onChange: () => void; last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, last && styles.toggleRowLast]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    },
    back: { color: colors.textPrimary, fontSize: 28 },
    headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
    body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
    sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginBottom: 10 },
    footNote: { color: colors.textMuted, fontSize: 11, marginTop: 8, marginBottom: 24, lineHeight: 16 },
    card: {
      backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden', marginBottom: 8,
    },
    toggleRow: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.divider,
    },
    toggleRowLast: { borderBottomWidth: 0 },
    toggleLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
    toggleDesc: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  });
}
