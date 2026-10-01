import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import {
  getSecureItem,
  setSecureItem,
  deleteSecureItem,
  SecureStorageKeys,
} from '../storage/secureStorage';
import { apiClient, toApiError } from '../api/client';

/**
 * Transaction push notifications over Expo's push infrastructure.
 *
 * ## Payload contract (what the backend must send)
 *
 * Expo delivers `data` as a flat string map, so every value here is a string.
 * The schema is intentionally minimal and carries **no secrets** — no PIN, no
 * private key, no seed phrase, no balances, no email, no raw seed material:
 *
 * ```json
 * {
 *   "type": "transfer.received" | "transfer.sent.confirmed" | "transfer.sent.failed",
 *   "transactionId": "<uuid>",
 *   "asset": "USDC",
 *   "amount": "25.5",
 *   "network": "ETH",
 *   "status": "COMPLETED" | "FAILED",
 *   "counterparty": "1234567890"
 * }
 * ```
 *
 * `title` / `body` are server-authored display strings. They are treated as
 * untrusted: `parseTransactionNotification` accepts them for display but never
 * derives any navigation target from their contents.
 *
 * ## Server endpoints this integration calls
 *
 * The backend does not expose push-token routes today. They are called here so
 * the moment the routes ship the app works with no client change:
 *
 *   POST   {EXPO_PUBLIC_PUSH_TOKEN_PATH}  { token, platform, deviceName } -> { success, id }
 *   DELETE {EXPO_PUBLIC_PUSH_TOKEN_PATH}  { token }                     -> { success }
 *
 * A 404/405 on either is treated as "backend not yet deployed" and remembered
 * for the session. See README "Push notifications" for the exact contract.
 *
 * ## The two calls below are switched off
 *
 * There is no `/api/push/token` route, and none is being added, so a request
 * there can only ever fail. The session flag was not enough to stop it: it was
 * set *after* a 404 came back, so the first call always went out. Because
 * `notificationService` runs `syncRegisteredToken` every time the app is
 * foregrounded, that was a doomed POST on every cold start and every return to
 * the foreground, and a 404 in the server log for each one.
 *
 * `EXPO_PUBLIC_PUSH_REGISTRATION` turns the server call back on when a route
 * exists. It is deliberately separate from `EXPO_PUBLIC_PUSH_TOKEN_PATH`:
 * repointing the path at a different host does not make a route exist.
 *
 * Only the server call is suppressed. Permission prompts, token capture, badge
 * clearing and the notification handler are untouched, so the settings screen
 * still works and still reports its state honestly.
 */
const PUSH_TOKEN_PATH = process.env.EXPO_PUBLIC_PUSH_TOKEN_PATH ?? '/api/push/token';

/** Off unless explicitly turned on. See above. */
const PUSH_REGISTRATION_ENABLED = process.env.EXPO_PUBLIC_PUSH_REGISTRATION === 'true';

/** The three transaction events the backend triggers. */
export type TransactionNotificationType =
  | 'transfer.received'
  | 'transfer.sent.confirmed'
  | 'transfer.sent.failed';

export interface TransactionNotificationPayload {
  type: TransactionNotificationType;
  transactionId: string;
  asset: string;
  amount: string;
  network: string;
  status: 'COMPLETED' | 'FAILED';
  /** Account ID, or a truncated external address. Never an internal id. */
  counterparty: string;
}

const VALID_TYPES: ReadonlySet<string> = new Set<TransactionNotificationType>([
  'transfer.received',
  'transfer.sent.confirmed',
  'transfer.sent.failed',
]);

/** Only lowercase hex/dashes — matches the backend's uuid column. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Decimal string, bounded length. Guards against arbitrary payload injection. */
const DECIMAL_RE = /^\d{1,30}(\.\d{1,30})?$/;

function asString(value: unknown, max = 140): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Validates a raw push `data` map into a typed payload.
 *
 * Anything that does not match is rejected outright rather than partially
 * trusted: a malformed or spoofed notification must not be able to navigate
 * the user to an arbitrary transaction id, or render attacker-controlled text
 * in the transaction list.
 */
export function parseTransactionNotification(
  data: Record<string, unknown> | null | undefined
): TransactionNotificationPayload | null {
  if (!data) return null;

  const type = asString(data.type, 40);
  if (!type || !VALID_TYPES.has(type)) return null;

  const transactionId = asString(data.transactionId, 36);
  if (!transactionId || !UUID_RE.test(transactionId)) return null;

  const asset = asString(data.asset, 20);
  const amount = asString(data.amount, 40);
  const network = asString(data.network, 20);
  const counterparty = asString(data.counterparty, 140);
  if (!asset || !amount || !network || !counterparty) return null;
  if (!DECIMAL_RE.test(amount)) return null;

  // Status must agree with the event type — a "confirmed" alert carrying
  // status FAILED (or omitting it) is a backend bug, not something to render.
  const expectedStatus = type === 'transfer.sent.failed' ? 'FAILED' : 'COMPLETED';
  const status = asString(data.status, 16);
  if (status !== expectedStatus) return null;

  return {
    type: type as TransactionNotificationType,
    transactionId,
    asset,
    amount,
    network,
    status: expectedStatus,
    counterparty,
  };
}

/** Display copy derived from the payload. Never interpolates server-free text. */
export function notificationCopy(
  payload: TransactionNotificationPayload
): { title: string; body: string; tone: 'success' | 'error' | 'neutral' } {
  const { type, amount, asset, counterparty } = payload;
  const value = `${amount} ${asset}`;
  switch (type) {
    case 'transfer.received':
      return { title: 'Money received', body: `You received ${value} from ${counterparty}.`, tone: 'success' };
    case 'transfer.sent.confirmed':
      return { title: 'Transfer confirmed', body: `Your ${value} transfer is confirmed on the network.`, tone: 'success' };
    case 'transfer.sent.failed':
      return { title: 'Transfer failed', body: `Your ${value} transfer could not be completed. Your funds were not sent.`, tone: 'error' };
  }
}

/** Deep link the notification tap navigates to. */
export function notificationRoute(payload: TransactionNotificationPayload): string {
  return `/transaction/${payload.transactionId}`;
}

// --- Foreground presentation -------------------------------------------------

let handlerConfigured = false;

/**
 * Must run before the app finishes mounting for the foreground behaviour to
 * apply. Safe to call repeatedly.
 */
export function configureNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // Always surface the banner: an incoming transfer is the one thing the
      // user must not miss because they happened to have the app open.
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// --- Permission + token registration -----------------------------------------

export type PushSupport =
  /** Push delivery is impossible in this environment (simulator / web). */
  | 'unsupported'
  | 'denied'
  | 'ready'
  /** Permission granted, token obtained, backend acknowledged. */
  | 'registered'
  /** Permission granted, token obtained, but the backend has no push routes. */
  | 'backend-pending';

export interface PushRegistrationState {
  support: PushSupport;
  /** Present only once a token has been issued by Expo. */
  token: string | null;
  /** User-facing explanation when `support` is not 'ready'/'registered'. */
  detail: string | null;
}

/**
 * True when this install must not call `PUSH_TOKEN_PATH` — either the
 * integration is switched off, or a 404/405 already proved the route is absent.
 * `registerPushToken`, `syncRegisteredToken` and `unregisterPushToken` all
 * consult this before their request, so seeding it from the flag disables all
 * three in one place.
 */
let backendUnsupported = !PUSH_REGISTRATION_ENABLED;

/** True when this runtime can ever receive an Expo push token. */
export function isPushSupportedPlatform(): boolean {
  // Expo only issues a real push token on a physical device. Simulators and
  // web always return undefined, so we detect that up front rather than
  // showing a permission prompt that can never be satisfied.
  if (Platform.OS === 'web') return false;
  return Device.isDevice;
}

export function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

export async function requestPushPermission(): Promise<{ granted: boolean; detail: string | null }> {
  if (!isPushSupportedPlatform()) {
    return {
      granted: false,
      detail: 'Push notifications need a physical device. Use Expo Go on your phone, or a development build.',
    };
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return { granted: true, detail: null };
  if (!current.canAskAgain) {
    return {
      granted: false,
      detail: 'Notifications are turned off for this app. Enable them in your device settings.',
    };
  }

  const requested = await Notifications.requestPermissionsAsync();
  if (!requested.granted) {
    return { granted: false, detail: 'Notifications are turned off. You can enable them in your device settings.' };
  }
  return { granted: true, detail: null };
}

/**
 * Fetches the Expo push token for this install.
 *
 * `projectId` is required from SDK 49 onward. It is read from
 * `app.json -> expo.extra.eas.projectId`; see README for the one-time
 * `eas init` / EAS project linking step if it is missing.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!isPushSupportedPlatform()) return null;
  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error(
      'EXPO_PUBLIC_PUSH_TOKEN_PATH aside, expo.extra.eas.projectId is missing — run `eas init` to link an EAS project before enabling push.'
    );
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data ?? null;
}

/**
 * Registers the current Expo push token with the backend for the signed-in
 * user. Idempotent by design:
 *  - the same token is re-sent on every app foreground, and the backend is
 *    expected to upsert rather than insert, so a user with the app installed
 *    on several devices ends up with several rows (one per token) and exactly
 *    one notification per install;
 *  - a 404/405 is remembered so we stop retrying a route that does not exist
 *    yet instead of failing the whole call.
 */
export async function registerPushToken(): Promise<PushRegistrationState> {
  if (backendUnsupported) {
    return { support: 'backend-pending', token: await getSecureItem(SecureStorageKeys.PUSH_TOKEN), detail: null };
  }

  const permission = await requestPushPermission();
  if (!permission.granted) {
    return { support: isPushSupportedPlatform() ? 'denied' : 'unsupported', token: null, detail: permission.detail };
  }

  let token: string;
  try {
    const fetched = await getExpoPushToken();
    if (!fetched) {
      return { support: 'unsupported', token: null, detail: 'This device did not return a push token.' };
    }
    token = fetched;
  } catch {
    // A missing EAS project id or an Expo outage both land here. The user-facing
    // detail is deliberately generic — the underlying reason is configuration,
    // and it is already logged by `getExpoPushToken`.
    return { support: 'unsupported', token: null, detail: 'Could not obtain a push token for this device.' };
  }

  // Persist before the network call: if registration fails the token is still
  // known, and `syncRegisteredToken` can retry without another OS prompt.
  await setSecureItem(SecureStorageKeys.PUSH_TOKEN, token);

  try {
    await apiClient.post(PUSH_TOKEN_PATH, {
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? undefined,
    });
    return { support: 'registered', token, detail: null };
  } catch (err) {
    const apiError = toApiError(err);
    if (apiError.status === 404 || apiError.status === 405) {
      backendUnsupported = true;
      return {
        support: 'backend-pending',
        token,
        detail:
          'The server has not deployed push-token registration yet, so notifications cannot be delivered to this device.',
      };
    }
    console.error('Push token registration failed:', apiError);
    return {
      support: 'ready',
      token,
      detail: 'We could not finish setting up notifications. We will try again shortly.',
    };
  }
}

/**
 * Re-sends the already-stored token without prompting for permission again.
 * Used on app foreground so a token rotated while the app was backgrounded
 * lands on the server.
 */
export async function syncRegisteredToken(): Promise<void> {
  if (backendUnsupported) return;
  const stored = await getSecureItem(SecureStorageKeys.PUSH_TOKEN);
  if (!stored) return;
  try {
    const fresh = await getExpoPushToken();
    if (fresh && fresh !== stored) {
      await setSecureItem(SecureStorageKeys.PUSH_TOKEN, fresh);
    }
    await apiClient.post(PUSH_TOKEN_PATH, {
      token: fresh ?? stored,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? undefined,
    });
  } catch (err) {
    const apiError = toApiError(err);
    if (apiError.status === 404 || apiError.status === 405) {
      backendUnsupported = true;
      return;
    }
    console.error('Push token sync failed:', apiError);
  }
}

/**
 * Best-effort server-side removal, called on logout and on account deletion so
 * notifications for a signed-out / deleted user stop immediately. A failure is
 * never surfaced: the user is signing out regardless, and the local token is
 * wiped either way.
 */
export async function unregisterPushToken(): Promise<void> {
  const token = await getSecureItem(SecureStorageKeys.PUSH_TOKEN);
  await deleteSecureItem(SecureStorageKeys.PUSH_TOKEN);
  if (!token || backendUnsupported) return;
  try {
    await apiClient.delete(PUSH_TOKEN_PATH, { data: { token } });
  } catch (err) {
    console.error('Push token removal failed (continuing sign-out):', toApiError(err));
  }
}

/** Wipe the Expo badge. Used on sign-out. */
export async function clearLocalNotificationState(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Not supported on every platform; purely cosmetic.
  }
}
