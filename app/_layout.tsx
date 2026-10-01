/* eslint-disable @typescript-eslint/no-require-imports, import/first */
// Must stay the very first thing executed in this file
require('../lib/polyfills');

import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';

import { useUserStore } from '../stores/userStore';
import { useWalletStore } from '../stores/walletStore';
import { useAuthGateStore } from '../stores/authGateStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useThemeStore } from '../lib/theme';
import { useUlmaraFonts } from '../lib/theme/fonts';
import {
  handleAppForeground,
  initialiseNotificationsForSession,
  startNotificationService,
} from '../lib/push/notificationService';

// Keep splash screen visible while we check auth state and load typefaces.
SplashScreen.preventAutoHideAsync();

// How long the app may sit in the background before it re-locks. Short enough
// that handing an unlocked phone to someone else does not hand them the wallet,
// long enough that switching apps to copy an address is not punished.
const RELOCK_AFTER_BACKGROUND_MS = 2 * 60 * 1000;

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const gateStatus = useAuthGateStore((s) => s.status);
  const pinMissing = useAuthGateStore((s) => s.pinMissing);
  const checkAuthGate = useAuthGateStore((s) => s.check);
  const hydrateUser = useUserStore((s) => s.hydrate);
  const hydrateWallet = useWalletStore((s) => s.hydrate);
  const hydratePreferences = usePreferencesStore((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrateTheme);

  // Newsreader + Manrope. The splash screen stays up until these resolve so the
  // app never flashes in the system face and then swaps — which is a visible
  // reflow on every cold start, and worse on a balance screen where the type is
  // the content. `useUlmaraFonts` reports failures rather than throwing; the
  // splash is still released so the app remains usable with fallback type.
  const { fontsLoaded } = useUlmaraFonts();

  // Run once on mount to establish initial gate status and load preferences + theme.
  useEffect(() => {
    checkAuthGate().finally(() => SplashScreen.hideAsync());
    hydratePreferences();
    hydrateTheme();
    // OS-level push listeners (foreground / background / tap / token refresh).
    startNotificationService();
  }, [checkAuthGate, hydratePreferences, hydrateTheme]);

  useEffect(() => {
    if (fontsLoaded) {
      // Typography is now stable; releasing the splash here rather than in the
      // gate effect means a slow auth check cannot delay first paint.
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Whenever gate flips to authed, hydrate user + wallet and register push.
  useEffect(() => {
    if (gateStatus !== 'authed') return;
    Promise.all([hydrateUser(), hydrateWallet()]).catch((err) =>
      console.error('Post-auth hydrate failed:', err)
    );
    // Push permission is requested here, not at mount: a cold start that lands
    // on the PIN screen must not interrupt with an OS prompt before the user
    // has even proven who they are.
    initialiseNotificationsForSession().catch((err) =>
      console.error('Notification init failed:', err)
    );
  }, [gateStatus, hydrateUser, hydrateWallet]);

  useEffect(() => {
    if (gateStatus === 'checking') return;

    const inAuthGroup = segments[0] === '(auth)';
    const onVerifyPin = (segments as string[])[1] === 'verify-pin';
    const onCreatePin = (segments as string[])[1] === 'create-pin';

    if (gateStatus === 'guest' && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (gateStatus === 'locked' && pinMissing) {
      // This account has no PIN, so verify-pin can never be satisfied. Hold the
      // user on create-pin instead of bouncing them back to a keypad that
      // rejects every entry.
      if (!onCreatePin) router.replace('/(auth)/create-pin');
    } else if (gateStatus === 'locked' && !onVerifyPin) {
      router.replace('/(auth)/verify-pin');
    } else if (gateStatus === 'authed' && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [gateStatus, pinMissing, segments, router]);

  // --- App lock ---------------------------------------------------------------
  const backgroundedAtRef = useRef<number | null>(null);

  const onAppStateChange = useCallback(
    (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next !== 'active') return;

      const since = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      // Re-sync a possibly-rotated push token whenever we come back.
      handleAppForeground();

      if (since === null) return;
      if (Date.now() - since < RELOCK_AFTER_BACKGROUND_MS) return;

      // Only re-lock a session that was actually unlocked. `pinVerified` lives
      // in the gate store and is already false for a cold start.
      void import('../stores/authGateStore').then(({ useAuthGateStore }) => {
        const gate = useAuthGateStore.getState();
        if (gate.status !== 'authed' || !gate.pinVerified) return;
        gate.resetPinVerified();
        void gate.check();
        router.replace('/(auth)/verify-pin');
      });
    },
    [router]
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [onAppStateChange]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Slot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Root error boundary, via expo-router's `ErrorBoundary` export convention.
 *
 * Defined here rather than per-route so it covers every screen, including the
 * ones pushed above this layout. See components/ErrorBoundary.tsx for why the
 * fallback is custom rather than expo-router's built-in one.
 */
export { ErrorBoundary } from '../components/ErrorBoundary';
