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
        <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.logoLetter}>U</Text>
        </View>
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
    logoBadge: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    logoLetter: {
      color: '#FFFFFF',
      fontSize: 32,
      fontWeight: '900',
    },
    title: { fontSize: 34, fontWeight: '800', color: colors.textPrimary, lineHeight: 42, letterSpacing: -0.5 },
    subtitle: { fontSize: 16, color: colors.textMuted, marginTop: 16, lineHeight: 24 },
    footer: { paddingHorizontal: 24, paddingBottom: 36, gap: 12 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      height: 54,
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    secondaryBtn: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      height: 54,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  });
}
