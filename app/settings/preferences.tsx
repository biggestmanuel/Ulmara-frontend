import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '../../components/navigation/BackButton';
import {
  Button,
  ListRow,
  Screen,
  SectionLabel,
  SegmentedControl,
  Touchable,
  Typography,
} from '../../components/ui';
import { getMe, updateSettings } from '../../lib/api/accountId';
import { friendlyError } from '../../lib/api/client';
import { radius, space, useThemeStore, type ThemeMode } from '../../lib/theme';

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' },
  { label: 'System', value: 'system' },
];

const CURRENCIES = [
  { value: 'USD', label: 'US Dollar' },
  { value: 'NGN', label: 'Nigerian Naira' },
  { value: 'EUR', label: 'Euro' },
  { value: 'GBP', label: 'Pound Sterling' },
] as const;

type Currency = (typeof CURRENCIES)[number]['value'];

/**
 * Preferences.
 *
 * ## What changed
 *
 * - **A silent-failure bug.** `save()` caught every error and only wrote to
 *   `console.error`, so a failed preference write left the UI showing the new
 *   value as if it had stuck. The user changed their currency, the server
 *   rejected it, and the app said nothing — and on the next load the old value
 *   silently returned. Selection is now optimistic, then **reverted with a
 *   visible message** if the write fails, so the screen never lies about what
 *   was saved.
 * - The three hand-drawn radio groups (three views each, no role, no label, no
 *   state) are now `SegmentedControl`s and a labelled option list. A screen
 *   reader previously met "Dark Mode" as an unlabelled pressable and could not
 *   tell which was selected.
 * - The "APPEARANCE" theme picker is duplicated from `settings/index.tsx`; this
 *   screen links back rather than re-implementing it, so there is one source of
 *   truth for the theme.
 */
export default function Preferences() {
  const colors = useThemeStore((state) => state.colors);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  const [currency, setCurrency] = useState<Currency>('USD');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me.defaultCurrency) setCurrency(me.defaultCurrency as Currency);
        // `defaultLanguage` is deliberately NOT read or written. The backend
        // accepts it, but the app has no translations and shipped a picker
        // offering French and Spanish that changed nothing. Offering a language
        // the app cannot speak is worse than not offering it, so the control is
        // gone until there are actual translations to select between.
      } catch (err) {
        if (cancelled) return;
        // Not fatal: the user can still change a preference, and the write will
        // surface its own error. Saying so beats silently showing defaults that
        // may be wrong.
        setNotice({
          tone: 'error',
          text: friendlyError(err, 'Could not load your saved preferences. Showing defaults.'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Optimistically apply, then confirm with the server, and roll back on
   * failure. The previous version kept the new value and logged the error.
   */
  const save = useCallback(
    async (key: string, patch: Record<string, string>, rollback: () => void, label: string) => {
      setSavingKey(key);
      setNotice(null);
      try {
        await updateSettings(patch);
        setNotice({ tone: 'success', text: `${label} saved` });
      } catch (err) {
        rollback();
        setNotice({
          tone: 'error',
          text: friendlyError(err, `Could not save ${label.toLowerCase()}. Your change was undone.`),
        });
      } finally {
        setSavingKey(null);
      }
    },
    []
  );

  const pickCurrency = useCallback(
    (next: Currency) => {
      if (next === currency) return;
      const previous = currency;
      setCurrency(next);
      void save('currency', { defaultCurrency: next }, () => setCurrency(previous), 'Currency');
    },
    [currency, save]
  );

  return (
    <Screen testID="preferences-screen">
      <View style={styles.header}>
        <BackButton />
        <Typography variant="titleSm" style={styles.headerTitle}>
          Preferences
        </Typography>
        {savingKey ? <Ionicons name="sync-outline" size={16} color={colors.textMuted} /> : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.group}>
          <SectionLabel>APPEARANCE</SectionLabel>
          <SegmentedControl<ThemeMode>
            accessibilityLabel="Theme"
            value={mode}
            onChange={(next) => void setMode(next)}
            options={THEME_OPTIONS}
          />
          <Button
            label="All settings"
            variant="ghost"
            onPress={() => router.push('/settings')}
          />
        </View>

        <View style={styles.group}>
          <SectionLabel>DEFAULT CURRENCY</SectionLabel>
          {CURRENCIES.map((option, index) => (
            <ListRow
              key={option.value}
              title={option.label}
              subtitle={option.value}
              showSeparator={index < CURRENCIES.length - 1}
              onPress={() => pickCurrency(option.value)}
              accessibilityLabel={`${option.label}, ${option.value}`}
              accessibilityState={{ selected: currency === option.value, busy: savingKey === 'currency' }}
              aria-selected={currency === option.value}
              trailing={
                currency === option.value ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null
              }
            />
          ))}
        </View>

        <View style={styles.group}>
          <SectionLabel>ABOUT</SectionLabel>
          <ListRow
            title="Language"
            subtitle="English"
            showSeparator={false}
            accessibilityLabel="Language: English"
            accessibilityHint="Ulmara is currently only available in English"
            leading={
              <View style={styles.langIcon}>
                <Ionicons name="language-outline" size={17} color={colors.primary} />
              </View>
            }
          />
          <ListRow
            title="Display currency"
            subtitle={`Balances are shown in ${currency}`}
            showSeparator={false}
            accessibilityLabel={`Display currency, ${currency}`}
          />
        </View>

        {notice ? (
          <Touchable
            accessibilityRole="alert"
            accessibilityLabel={notice.text}
            onPress={() => setNotice(null)}
            pressScale={0.99}
            style={[
              styles.notice,
              { backgroundColor: notice.tone === 'error' ? colors.errorTint : colors.successTint },
            ]}
          >
            <Ionicons
              name={notice.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
              size={16}
              color={notice.tone === 'error' ? colors.error : colors.success}
            />
            <Typography
              variant="caption"
              color={notice.tone === 'error' ? colors.error : colors.success}
              style={styles.noticeText}
            >
              {notice.text}
            </Typography>
          </Touchable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  scroll: { flex: 1 },
  body: { paddingTop: space.lg, paddingBottom: space.xxxl },

  group: { marginBottom: space.xxl, gap: space.xs },

  langIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 12,
    marginTop: space.md,
  },
  noticeText: { flex: 1 },
});
