import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getMe, updateSettings } from '../../lib/api/accountId';
import { useThemeStore, ThemeMode, ThemeColors } from '../../lib/theme';

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Dark Mode', value: 'dark' },
  { label: 'Light Mode', value: 'light' },
  { label: 'System Default', value: 'system' },
];

const CURRENCIES = ['USD', 'NGN', 'EUR', 'GBP'] as const;
const LANGUAGES = [
  { label: 'English', code: 'en' },
  { label: 'French', code: 'fr' },
  { label: 'Spanish', code: 'es' },
] as const;

export default function Preferences() {
  const { colors, mode, setMode } = useThemeStore();
  const styles = getStyles(colors);
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('USD');
  const [languageCode, setLanguageCode] = useState('en');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (me.defaultCurrency) setCurrency(me.defaultCurrency as any);
        if (me.defaultLanguage) setLanguageCode(me.defaultLanguage);
      } catch (err) {
        console.error('Failed to load preferences:', err);
      }
    })();
  }, []);

  const save = async (patch: any) => {
    setSaving(true);
    try {
      await updateSettings(patch);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Preferences</Text>
        <View style={styles.backBtn}>
          {saving && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Appearance / Theme */}
        <Text style={styles.sectionTitle}>APPEARANCE</Text>
        <View style={styles.card}>
          {THEME_OPTIONS.map((opt, idx) => (
            <Pressable
              key={opt.value}
              style={[
                styles.optionRow,
                idx < THEME_OPTIONS.length - 1 && styles.rowDivider,
              ]}
              onPress={() => setMode(opt.value)}
            >
              <Text style={styles.optionText}>{opt.label}</Text>
              <View style={styles.radio}>
                {mode === opt.value && <View style={styles.radioFill} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Currency */}
        <Text style={styles.sectionTitle}>DEFAULT CURRENCY</Text>
        <View style={styles.card}>
          {CURRENCIES.map((curr, idx) => (
            <Pressable
              key={curr}
              style={[
                styles.optionRow,
                idx < CURRENCIES.length - 1 && styles.rowDivider,
              ]}
              onPress={() => {
                setCurrency(curr);
                save({ defaultCurrency: curr });
              }}
            >
              <Text style={styles.optionText}>{curr}</Text>
              <View style={styles.radio}>
                {currency === curr && <View style={styles.radioFill} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Language */}
        <Text style={styles.sectionTitle}>LANGUAGE</Text>
        <View style={styles.card}>
          {LANGUAGES.map((lang, idx) => (
            <Pressable
              key={lang.code}
              style={[
                styles.optionRow,
                idx < LANGUAGES.length - 1 && styles.rowDivider,
              ]}
              onPress={() => {
                setLanguageCode(lang.code);
                save({ defaultLanguage: lang.code });
              }}
            >
              <Text style={styles.optionText}>{lang.label}</Text>
              <View style={styles.radio}>
                {languageCode === lang.code && <View style={styles.radioFill} />}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center' },
    backText: { color: colors.textPrimary, fontSize: 28 },
    headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
    scroll: { padding: 20 },
    sectionTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    optionText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioFill: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  });
}