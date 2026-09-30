import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import {
  clearLocalNotificationState,
  configureNotificationHandler,
  parseTransactionNotification,
  registerPushToken,
  syncRegisteredToken,
  unregisterPushToken,
  type PushRegistrationState,
} from './pushNotifications';
import { useNotificationStore, type NotificationItem } from '../../stores/notificationStore';
import { useTxStore } from '../../stores/txStore';
import { useWalletStore } from '../../stores/walletStore';
import { usePreferencesStore } from '../../stores/preferencesStore';

let started = false;
let subscriptions: NativeEventSubscription[] = [];

/**
 * Navigates from a notification tap.
 *
 * Routed through the auth gate on purpose: a push can arrive while the app is
 * locked (cold start from a notification tap), and deep-linking straight into
 * `/transaction/:id` would render the receipt behind the PIN screen.
 */
function openNotification(item: NotificationItem): void {
  useNotificationStore.getState().markRead(item.id);
  // `getState()` on the gate avoids importing the store into this module's
  // initialisation order; the value is only read at tap time.
  void import('../../stores/authGateStore').then(({ useAuthGateStore }) => {
    const status = useAuthGateStore.getState().status;
    if (status === 'checking') return;
    if (status !== 'authed') {
      // Let the root layout's redirect send the user to PIN entry; the
      // notification is already marked read and stays in the list.
      return;
    }
    router.push(item.route as never);
  });
}

function handlePayload(
  data: Record<string, unknown> | null | undefined,
  source: 'foreground' | 'background' | 'open'
): void {
  const payload = parseTransactionNotification(data);
  if (!payload) {
    // A malformed or non-transaction push is ignored rather than rendered.
    return;
  }

  // Device-local category filter. The backend sends all three events; a user who
  // turned one off should not still see it, and the preference is device-local
  // by design (see stores/preferencesStore).
  if (!usePreferencesStore.getState().isTransactionEventEnabled(payload.type)) return;

  // Duplicate protection lives in the store: the same push can reach us twice
  // (foreground + open, or an Expo redelivery) and must appear once.
  const item = useNotificationStore.getState().receive(payload);
  if (!item) return;

  if (source === 'foreground' || source === 'background') {
    // A status change on a transfer we already know about: pull the authoritative
    // row from the API rather than trusting the push payload for balances/state.
    void useTxStore.getState().fetchInitial();
    void useWalletStore.getState().refreshBalances();
  }
}

/**
 * Installs the OS-level listeners. Idempotent.
 *
 * Covers the three delivery paths the app has to handle:
 *  - foreground  — `handleNotification` fired while the app is open
 *  - background  — `handleNotification` fired with the app backgrounded (the
 *                  handler config decides whether a banner is also shown)
 *  - open (tap)  — `getLastNotificationResponseAsync` on cold start plus
 *                  `addNotificationResponseReceivedListener` for warm taps
 */
export function startNotificationService(): void {
  if (started) return;
  started = true;

  configureNotificationHandler();

  // --- Foreground + background -------------------------------------------------
  subscriptions.push(
    Notifications.addNotificationReceivedListener((notification) => {
      const appState = AppState.currentState;
      handlePayload(notification.request.content.data, appState === 'active' ? 'foreground' : 'background');
    })
  );

  // --- Tap while the app is running (or backgrounded) -------------------------
  subscriptions.push(
    Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = parseTransactionNotification(response.notification.request.content.data);
      if (!payload) return;
      const item = useNotificationStore.getState().receive(payload);
      if (item) openNotification(item);
    })
  );

  // --- Cold start from a tap ---------------------------------------------------
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return;
      const payload = parseTransactionNotification(response.notification.request.content.data);
      if (!payload) return;
      const item = useNotificationStore.getState().receive(payload);
      if (item) openNotification(item);
    })
    .catch(() => undefined);
}

/** Called from the root layout on every transition to 'authed'. */
export async function initialiseNotificationsForSession(): Promise<PushRegistrationState> {
  await useNotificationStore.getState().hydrate();
  return registerPushToken();
}

/** Called on logout / account deletion. */
export async function teardownNotificationsForSession(): Promise<void> {
  await unregisterPushToken();
  await clearLocalNotificationState();
  useNotificationStore.getState().clear();
}

/**
 * Re-registers a possibly-rotated token when the app returns to the foreground.
 *
 * This is the token-refresh path for expo-notifications SDK 57, which no longer
 * exposes a dedicated token-refresh event. `syncRegisteredToken` re-reads the
 * live Expo token, rewrites the locally stored copy when it differs, and
 * re-POSTs it, so a token rotated by a reinstall or an app restore reaches the
 * backend without any other trigger.
 */
export function handleAppForeground(): void {
  if (AppState.currentState === 'active') void syncRegisteredToken();
}

export function subscribeToAppState(
  listener: (state: AppStateStatus) => void
): NativeEventSubscription {
  const sub = AppState.addEventListener('change', listener);
  subscriptions.push(sub);
  return sub;
}

export function stopNotificationService(): void {
  subscriptions.forEach((sub) => sub.remove());
  subscriptions = [];
  started = false;
}
