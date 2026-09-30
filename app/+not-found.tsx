import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Screen, Typography } from '../components/ui';
import { radius, space, useThemeStore } from '../lib/theme';

/**
 * 404.
 *
 * ## What changed
 *
 * The old version was three unlabelled presses of the defaults — bare
 * `Text`, a `Link` wrapping a `Pressable` with no role and no label, and
 * hardcoded `fontSize`/`fontWeight` that ignored the theme entirely, so this
 * was the one screen guaranteed to look like a different app if a user ever
 * hit a bad route.
 *
 * It is now the shared `EmptyState` idiom with a real `Button`, which means it
 * has a name, a role, a 56pt target, and follows the light/dark theme. The copy
 * also tells the user what to do rather than only what happened.
 */
export default function NotFoundScreen() {
  const colors = useThemeStore((state) => state.colors);

  return (
    <Screen center testID="not-found">
      <View style={styles.wrap}>
        <View style={[styles.glyph, { backgroundColor: colors.surfaceElevated }]}>
          <Ionicons name="compass-outline" size={30} color={colors.textMuted} />
        </View>

        <Typography variant="title">Page not found</Typography>
        <Typography variant="body" color={colors.textMuted} style={styles.body}>
          That link does not match any screen in Ulmara. It may be out of date, or the
          address may have a typo.
        </Typography>

        <Button label="Go to home" onPress={() => router.replace('/(tabs)/home')} />
        <Button label="Open support settings" variant="ghost" onPress={() => router.replace('/settings')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg, maxWidth: 360 },
  glyph: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  body: { textAlign: 'center' },
});
