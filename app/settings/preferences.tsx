import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getMe, updateSettings } from '../../lib/api/accountId';
import { useThemeStore, ThemeMode } from '../../lib/theme';

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.textMuted }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Text style={[styles.backText, { color: colors.textMuted }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.primary }]}>Preferences</Text>
        <View style={{ width: 50 }}>{saving && <ActivityIndicator size="small" color={colors.primary} />}</View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Appearance / Theme */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.textMuted }]}>
          {THEME_OPTIONS.map((opt, idx) => (
            <Pressable
              key={opt.value}
              style={[
                styles.optionRow,
                idx < THEME_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.textMuted },
              ]}
              onPress={() => setMode(opt.value)}
            >
              <Text style={[styles.optionText, { color: colors.primary }]}>{opt.label}</Text>
              <View style={[styles.radio, { borderColor: colors.primary }]}>
                {mode === opt.value && <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Currency */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DEFAULT CURRENCY</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.textMuted }]}>
          {CURRENCIES.map((curr, idx) => (
            <Pressable
              key={curr}
              style={[
                styles.optionRow,
                idx < CURRENCIES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.textMuted },
              ]}
              onPress={() => {
                setCurrency(curr);
                save({ defaultCurrency: curr });
              }}
            >
              <Text style={[styles.optionText, { color: colors.primary }]}>{curr}</Text>
              <View style={[styles.radio, { borderColor: colors.primary }]}>
                {currency === curr && <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Language */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>LANGUAGE</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.textMuted }]}>
          {LANGUAGES.map((lang, idx) => (
            <Pressable
              key={lang.code}
              style={[
                styles.optionRow,
                idx < LANGUAGES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.textMuted },
              ]}
              onPress={() => {
                setLanguageCode(lang.code);
                save({ defaultLanguage: lang.code });
              }}
            >
              <Text style={[styles.optionText, { color: colors.primary }]}>{lang.label}</Text>
              <View style={[styles.radio, { borderColor: colors.primary }]}>
                {languageCode === lang.code && (
                  <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionText: { fontSize: 15, fontWeight: '600' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: { width: 10, height: 10, borderRadius: 5 },
});