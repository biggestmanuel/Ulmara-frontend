import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Screen, Typography } from '../../components/ui';
import { radius, space, useThemeStore } from '../../lib/theme';

/**
 * Welcome — the first screen anyone sees.
 *
 * ## What changed
 *
 * The old screen led with a 64pt rounded square carrying a lone "U" in white on
 * the accent, lifted by a coloured shadow (`shadowOpacity: 0.3`,
 * `elevation: 8`). A single letter in a glowing box is the most generic "crypto
 * app" opening there is, and it says nothing about what the product does.
 *
 * The redesign makes the **promise the hero**, and gives the mark a form that
 * belongs to this product specifically: a 4×4 grid of dots standing in for the
 * ten digits of an Account ID, with three of them filled to suggest a value
 * being assembled. It is drawn from plain views, so it costs nothing, needs no
 * image asset, and is derived from the thing the product is actually about.
 *
 * The headline is set in the serif display step at a real size. It is the
 * clearest signal that this is a financial product.
 */
export default function Welcome() {
  const colors = useThemeStore((state) => state.colors);

  return (
    <Screen>
      <View style={styles.body}>
        <AccountIdMark />

        <Typography variant="title" style={styles.title}>
          Send crypto{'\n'}with just an ID
        </Typography>

        <Typography variant="body" color={colors.textSecondary} style={styles.subtitle}>
          No wallet addresses to copy. No mistakes to make. Just your ten-digit
          Account ID.
        </Typography>
      </View>

      <View style={styles.footer}>
        <Button label="Create account" onPress={() => router.push('/(auth)/signup')} />
        <Button
          label="I already have an account"
          variant="ghost"
          onPress={() => router.push('/(auth)/login')}
        />
      </View>
    </Screen>
  );
}

/**
 * The Ulmara mark: ten dots in two rows of five, three of them filled.
 *
 * Static, dependency-free, and derived from the product rather than borrowed
 * from a template. Marked `accessibilityElementsHidden` because it carries no
 * information the surrounding copy does not already state.
 */
function AccountIdMark() {
  const colors = useThemeStore((state) => state.colors);
  const filled = new Set([0, 4, 7]);
  const rowA = [0, 1, 2, 3, 4];
  const rowB = [5, 6, 7, 8, 9];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
    >
      {[rowA, rowB].map((row, rowIndex) => (
        <View key={rowIndex} style={styles.markRow}>
          {row.map((index) => (
            <View
              key={index}
              style={[styles.dot, { backgroundColor: filled.has(index) ? colors.primary : colors.border }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },

  mark: {
    width: 84,
    height: 84,
    borderRadius: radius.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    marginBottom: space.xxl,
  },
  markRow: { flexDirection: 'row', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },

  title: { fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  subtitle: { marginTop: space.lg, maxWidth: 320 },

  footer: { gap: space.sm, paddingTop: space.xxl },
});
