import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore, ThemeColors } from '../../lib/theme';

export default function Welcome() {
  const { colors } = useThemeStore();
  const styles = getStyles(colors);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <View style={styles.logoDot} />
        <Text style={styles.title}>Send crypto with{'\n'}just an ID</Text>
        <Text style={styles.subtitle}>
          No wallet addresses to copy. No mistakes to make.
          Just your Account ID.
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.primaryBtn} onPress={() => router.push('/(auth)/signup')}>
          <Text style={styles.primaryBtnText}>Create Account</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoDot: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.primary, marginBottom: 24,
  },
  title: { fontSize: 34, fontWeight: '700', color: colors.textPrimary, lineHeight: 40 },
  subtitle: { fontSize: 16, color: colors.textMuted, marginTop: 16, lineHeight: 22 },
  footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: colors.textMuted, fontSize: 15, fontWeight: '500' },
});
}
