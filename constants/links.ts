/**
 * Every externally-visible Ulmara URL is built here.
 *
 * ## Why this exists
 *
 * The receive QR, the Share sheet, the payment-request QR and the exported
 * receipt each encoded a `https://ulmara.app/...` literal independently. When
 * the real domain is known that is four places to find and four chances to
 * miss one — and the failure is silent: a stale host produces a QR that scans
 * and then lands nowhere, which is worse than an obvious build error because
 * nobody sees it until a real person is standing in front of a real screen.
 *
 * So the host lives in exactly one place and every call site derives from it.
 *
 * ## Current state
 *
 * `ulmara.app` is a **placeholder**. It is not owned, configured, deployed or
 * verified, and nothing in this file attempts to. `EXPO_PUBLIC_WEB_BASE_URL` is
 * the single switch to flip when the real domain exists; no call site changes.
 *
 * ## Why the QR encodes a web URL, not a deep link
 *
 * `https://…/pay/<id>` is deliberate over `ulmara://pay/<id>`:
 *
 * - a phone's built-in camera app does not reliably hand custom schemes to
 *   anything, so a `ulmara://` QR is a dead end for anyone scanning outside the
 *   app;
 * - a printed or shared code has to work for a stranger who does not have
 *   Ulmara installed, and an `https://` link degrades to a normal web page;
 * - it is the only form that can later gain Universal Links / App Links, which
 *   is what would make the camera app open the app directly.
 *
 * EIP-681 is the standard for a crypto payment QR but encodes
 * `chain + address + amount`. Ulmara deliberately has no per-user address —
 * the ten-digit Account ID is resolved server-side — so an EIP-681 payload
 * would misrepresent how the system works. A bespoke HTTPS link is more honest.
 *
 * ## Scheme
 *
 * `APP_SCHEME` mirrors `expo.scheme` in `app.json`. It is duplicated rather
 * than imported because `app.json` is build configuration rather than a module.
 * `scripts/audit-design.mjs` asserts the two match, so they cannot drift
 * apart silently.
 */
import Constants from 'expo-constants';

const PLACEHOLDER_HOST = 'https://ulmara.app';

/** Mirrors `expo.scheme` in `app.json`; asserted equal by the design audit. */
const DEFAULT_SCHEME = 'ulmara';

/**
 * The public web origin. Overridable so a build can point at staging without a
 * code change. A trailing slash is stripped so callers can safely append paths.
 */
export const WEB_BASE_URL: string = (
  process.env.EXPO_PUBLIC_WEB_BASE_URL ?? PLACEHOLDER_HOST
).replace(/\/+$/, '');

/**
 * True while still on the unowned placeholder host.
 *
 * Deliberately surfaced rather than silently ignored: shipping a build that
 * points at a placeholder is a decision someone should be able to see, and
 * `scripts/audit-design.mjs` reports it.
 */
export const IS_PLACEHOLDER_DOMAIN = WEB_BASE_URL === PLACEHOLDER_HOST;

/**
 * Deep-link scheme, mirroring `expo.scheme`.
 *
 * `expo-constants` types `scheme` as `string | string[]`, because Expo permits
 * several schemes and takes the first for the primary. Narrowed here rather
 * than cast, so a genuinely wrong config surfaces as the documented fallback
 * rather than a `string[]` leaking into a template literal.
 */
export const APP_SCHEME: string = (() => {
  const configured = Constants.expoConfig?.scheme;
  if (Array.isArray(configured)) return configured[0] ?? DEFAULT_SCHEME;
  return configured ?? DEFAULT_SCHEME;
})();

/** The public payment page for a ten-digit Account ID. */
export function payPageUrl(accountId: string): string {
  return `${WEB_BASE_URL}/pay/${accountId}`;
}

/** A public page for a transaction hash. */
export function txUrl(txHash: string): string {
  return `${WEB_BASE_URL}/tx/${txHash}`;
}

/** The payload the receive QR encodes. */
export function receiveQrPayload(accountId: string): string {
  return payPageUrl(accountId);
}

/** The native deep link for the same destination, used by Share on device. */
export function nativeDeepLink(path: string): string {
  return `${APP_SCHEME}://${path.replace(/^\/+/, '')}`;
}
