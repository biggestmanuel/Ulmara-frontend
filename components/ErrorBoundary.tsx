import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Screen, Typography } from './ui';
import { radius, space, useThemeStore } from '../lib/theme';

/**
 * Root error boundary.
 *
 * ## Why this exists
 *
 * Without one, a render-time throw anywhere in the tree unmounts the whole app
 * to a white screen. In a wallet that is the worst possible failure: the user
 * cannot see their balance, cannot copy an address to recover funds, and has no
 * way back except force-quitting — and because the PIN gate re-locks on launch,
 * they cannot even get back in without their credentials, which is fine, except
 * they cannot see anything on the way there.
 *
 * ## Why a custom one rather than expo-router's
 *
 * expo-router ships a default `ErrorBoundary` that renders a bare red screen in
 * development and a generic message in release. This uses the same
 * `ErrorBoundary` export convention — no extra dependency, no custom router
 * infrastructure — but supplies a fallback that is actually usable: it explains
 * what happened in plain language, offers a way back to Home, and offers a full
 * restart for when Home is not reachable either.
 *
 * ## On the stack trace
 *
 * The error and its component stack are logged to the console in every build,
 * because a wallet bug that cannot be diagnosed is worse than a noisy log. They
 * are deliberately **not** rendered. A raw `TypeError: undefined is not an
 * object (evaluating 'tx.amount')` tells a non-technical user nothing actionable
 * and reads as though the app is broken beyond repair, which is usually not
 * true. The recovery paths below handle the overwhelming majority of cases.
 */
export function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { componentStack?: string | null };
  reset: () => void;
}) {
  const colors = useThemeStore((state) => state.colors);

  // Always log. This is the only place a render-time failure becomes visible.
  console.error('[error-boundary] unhandled render error:', error);
  if (error.componentStack) {
    console.error('[error-boundary] component stack:', error.componentStack);
  }

  const goHome = useCallback(() => {
    // Replace rather than push: the broken screen is still in the stack, and
    // going "back" into it would throw again.
    reset();
    router.replace('/(tabs)/home');
  }, [reset]);

  return (
    <Screen center testID="error-boundary">
      <View style={styles.wrap}>
        <View style={[styles.glyph, { backgroundColor: colors.errorTint }]}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.error} />
        </View>

        <Typography variant="title" style={styles.title}>
          Something went wrong
        </Typography>

        <Typography variant="body" color={colors.textMuted} style={styles.body}>
          This screen could not be displayed. Your funds and your Account ID are
          unaffected — nothing has been sent or deleted.
        </Typography>

        <View style={styles.actions}>
          <Button label="Back to home" onPress={goHome} />
          <Button label="Try again" variant="secondary" onPress={reset} />
          <Button
            label="Restart the app"
            variant="ghost"
            onPress={() => {
              // A full remount is the only reliable reset when module-level or
              // provider state is what is stuck. `Updates.reload` from
              // expo-updates is not available in every build, so this falls back
              // to replacing the whole history, which re-runs every provider.
              router.replace('/');
              reset();
            }}
          />
        </View>

        {__DEV__ ? (
          <Typography variant="code" color={colors.textMuted} style={styles.debug}>
            {error.message}
          </Typography>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg, maxWidth: 380 },
  glyph: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.md },
  debug: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.chip,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
