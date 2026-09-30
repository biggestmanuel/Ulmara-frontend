import { useState } from 'react';
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
  Sheet,
  Typography,
} from '../../components/ui';
import { useThemeStore, type ThemeMode } from '../../lib/theme';
import { getEvmMnemonic, getSolMnemonic, getTonMnemonic } from '../../lib/storage/secureStorage';
import { radius, space } from '../../lib/theme';

/**
 * Settings.
 *
 * ## What changed
 *
 * - The theme picker was three rows each with a hand-drawn radio circle and **no
 *   accessibility role, label or state**. It is a `SegmentedControl`, which
 *   reports itself as a tab list and marks the current option.
 * - Every "→" was a literal arrow character used as a chevron, and the back
 *   control was "← Back" text. All three are gone: navigation uses real
 *   `Ionicons` chevrons, and the back control is a named `BackButton`.
 * - The three "cards" holding one, one and three rows are now one flat list
 *   with hairline rules, which is what a settings list should look like.
 * - The recovery-phrase dialog is a `Sheet` with a focus-trapping container. It
 *   keeps the warning, and the phrases are still only read on explicit request —
 *   this is the most dangerous screen in the app and it is deliberately not on
 *   the main path.
 */
export default function SettingsScreen() {
  const colors = useThemeStore((state) => state.colors);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seeds, setSeeds] = useState<{ evm: string; sol: string; ton: string[] } | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const handleViewSeeds = async () => {
    try {
      const [evm, sol, ton] = await Promise.all([
        getEvmMnemonic(),
        getSolMnemonic(),
        getTonMnemonic(),
      ]);
      setSeeds({ evm: evm ?? '', sol: sol ?? '', ton: ton ?? [] });
      setSeedError(null);
      setShowSeedModal(true);
    } catch {
      // Previously this was an `Alert`, which on web renders as an unstyled
      // browser dialog. The sheet carries its own error slot instead, so the
      // message looks the same on every platform.
      setSeedError('Could not read secure storage on this device.');
      setShowSeedModal(true);
    }
  };

  return (
    <>
      <Screen testID="settings-screen">
        <View style={styles.header}>
          <BackButton />
          <Typography variant="titleSm" style={styles.headerTitle}>
            Settings
          </Typography>
        </View>

        <View style={styles.group}>
          <SectionLabel>APPEARANCE</SectionLabel>
          <SegmentedControl<ThemeMode>
            accessibilityLabel="Theme"
            value={mode}
            onChange={(next) => void setMode(next)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
        </View>

        <View style={styles.group}>
          <SectionLabel>NOTIFICATIONS</SectionLabel>
          {/* A real link, not a local toggle. Push registration is owned by
              /settings/notifications, which reports live status. */}
          <ListRow
            title="Push notifications"
            subtitle="What Ulmara tells you about"
            onPress={() => router.push('/settings/notifications')}
            accessibilityLabel="Push notifications"
            accessibilityHint="Opens notification settings"
            showSeparator={false}
            leading={
              <View style={styles.rowIcon}>
                <Ionicons name="notifications-outline" size={17} color={colors.primary} />
              </View>
            }
          />
        </View>

        <View style={styles.group}>
          <SectionLabel>SECURITY &amp; BACKUP</SectionLabel>
          <ListRow
            title="Contacts"
            subtitle="Account IDs you pay often"
            onPress={() => router.push('/contacts')}
            accessibilityLabel="Contacts"
            accessibilityHint="Opens your saved contacts"
            leading={
              <View style={styles.rowIcon}>
                <Ionicons name="people-outline" size={17} color={colors.primary} />
              </View>
            }
          />
          <ListRow
            title="Change your PIN"
            subtitle="Authorises transfers"
            onPress={() => router.push('/settings/security')}
            accessibilityLabel="Change your six-digit PIN"
            accessibilityHint="Opens PIN settings"
            leading={
              <View style={styles.rowIcon}>
                <Ionicons name="keypad-outline" size={17} color={colors.primary} />
              </View>
            }
          />
          <ListRow
            title="View recovery phrases"
            subtitle="The only way to restore this wallet"
            onPress={handleViewSeeds}
            accessibilityLabel="View recovery phrases"
            accessibilityHint="Shows the words that can restore this wallet"
            showSeparator={false}
            leading={
              <View style={[styles.rowIcon, { backgroundColor: colors.errorTint }]}>
                <Ionicons name="key-outline" size={17} color={colors.error} />
              </View>
            }
          />
        </View>
      </Screen>

      <Sheet
        visible={showSeedModal}
        onClose={() => setShowSeedModal(false)}
        title="Recovery phrases"
        subtitle="Write these down and keep them offline."
        footer={
          <Button label="I have backed them up" onPress={() => setShowSeedModal(false)} />
        }
      >
        <View style={[styles.warning, { backgroundColor: colors.errorTint }]}>
          <Ionicons name="warning" size={17} color={colors.error} />
          <Typography variant="label" color={colors.error} style={styles.warningText}>
            Never share these with anyone. Anyone who has them can take your funds.
          </Typography>
        </View>

        {seedError ? (
          <Typography
            variant="label"
            color={colors.error}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {seedError}
          </Typography>
        ) : null}

        {seeds ? (
          <ScrollView style={styles.seedScroll} showsVerticalScrollIndicator={false}>
            <SeedBlock label="EVM and TRON (12 words)" value={seeds.evm} />
            <SeedBlock label="Solana (12 words)" value={seeds.sol} />
            <SeedBlock label="TON (24 words)" value={seeds.ton.join(' ')} />
          </ScrollView>
        ) : null}
      </Sheet>
    </>
  );
}

/**
 * One recovery phrase, in monospace on a quiet fill.
 *
 * `selectable` so the words can be copied, and `importantForAccessibility` left
 * alone — a recovery phrase is user data the user explicitly asked to see, not
 * decoration, so it must reach a screen reader.
 */
function SeedBlock({ label, value }: { label: string; value: string }) {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View style={styles.seedBlock}>
      <Typography variant="label" color={colors.textSecondary}>
        {label}
      </Typography>
      <Typography
        variant="code"
        selectable
        style={[styles.seed, { backgroundColor: colors.surfaceElevated }]}
      >
        {value || 'Not available on this device'}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  headerTitle: { flex: 1 },

  group: { marginTop: space.xxl },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.chip,
    marginBottom: space.lg,
  },
  warningText: { flex: 1 },

  seedScroll: { maxHeight: 320 },
  seedBlock: { marginBottom: space.lg },
  seed: { padding: space.md, borderRadius: radius.chip, marginTop: space.xs },
});
