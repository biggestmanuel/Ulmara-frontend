import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Wrapper around expo-secure-store for sensitive values only
// (session token, account id, private-key material).
// Non-sensitive cache/session data should use MMKV instead, not this.

export const SecureStorageKeys = {
  SESSION_TOKEN: 'session_token',
  PIN_HASH: 'pin_hash', // deprecated — PIN is verified server-side now (User.pinHash), never cached on-device
  ACCOUNT_ID: 'account_id',
  MNEMONIC_ENCRYPTED: 'mnemonic_encrypted',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  // Capability bitmask of the enrollment last verified (e.g. "2" for Face ID).
  // Used to detect that the user added/removed a face or fingerprint. This is
  // a public platform constant, never biometric data, and never leaves the
  // device. See lib/security/biometrics.ts.
  BIOMETRIC_ENROLLMENT: 'biometric_enrollment',
  // Expo push token for this install. A device credential in the sense that
  // it grants notification delivery, so it lives in SecureStore rather than
  // AsyncStorage and is deleted on logout / account deletion.
  PUSH_TOKEN: 'push_token',
  // Non-custodial wallet secrets — never transmitted, device-only.
  EVM_MNEMONIC: 'evm_mnemonic', // covers ETH/BSC/BASE/POLYGON/TRON (shared secp256k1 mnemonic)
  SOL_MNEMONIC: 'sol_mnemonic',
  TON_MNEMONIC: 'ton_mnemonic', // stored JSON-stringified (24-word array)
} as const;

export type SecureStorageKey = (typeof SecureStorageKeys)[keyof typeof SecureStorageKeys];

/**
 * Key material that must never leave the OS keystore.
 *
 * A browser has no equivalent, so the web build refuses to persist these
 * rather than writing a recovery phrase into `localStorage`. Wallet generation
 * therefore fails on web with a clear message — the correct outcome, because a
 * web build of a non-custodial wallet has nowhere safe to put a mnemonic.
 */
const KEY_MATERIAL_KEYS: ReadonlySet<SecureStorageKey> = new Set<SecureStorageKey>([
  SecureStorageKeys.EVM_MNEMONIC,
  SecureStorageKeys.SOL_MNEMONIC,
  SecureStorageKeys.TON_MNEMONIC,
  SecureStorageKeys.MNEMONIC_ENCRYPTED,
]);

export class WebKeyMaterialUnsupportedError extends Error {
  readonly code = 'WEB_KEY_MATERIAL_UNSUPPORTED';
  constructor() {
    super(
      'Wallet key generation is not available on web: a browser cannot securely store a recovery ' +
        'phrase. Run the app on a physical device (or an Android/iOS simulator) to create a wallet.'
    );
    this.name = 'WebKeyMaterialUnsupportedError';
  }
}

const isWeb = Platform.OS === 'web';

/**
 * Web-only storage.
 *
 * `expo-secure-store` has no web implementation — its web build is a stub whose
 * `getItemAsync` throws "getValueWithKeyAsync is not a function". The auth gate
 * reads SecureStore on mount, so without this the app dies on web before the
 * first screen renders.
 *
 * This exists so the app can be run and verified in a browser during
 * development. It is NOT a security boundary: `localStorage` is readable by any
 * script on the origin. It therefore only ever holds non-secret items, and
 * throws for anything in KEY_MATERIAL_KEYS.
 */
const WEB_PREFIX = 'ulmara.web.';

function webGet(key: SecureStorageKey): string | null {
  try {
    return globalThis.localStorage?.getItem(WEB_PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

function webDelete(key: SecureStorageKey): void {
  try {
    globalThis.localStorage?.removeItem(WEB_PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

export async function getSecureItem(key: SecureStorageKey): Promise<string | null> {
  if (isWeb) return webGet(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.error(`SecureStore get failed for ${key}:`, err);
    return null;
  }
}

export async function setSecureItem(key: SecureStorageKey, value: string): Promise<boolean> {
  if (isWeb) {
    if (KEY_MATERIAL_KEYS.has(key)) throw new WebKeyMaterialUnsupportedError();
    try {
      globalThis.localStorage?.setItem(WEB_PREFIX + key, value);
    } catch {
      // Private-mode / quota exhaustion. Treated like a failed SecureStore write.
    }
    return true;
  }
  try {
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch (err) {
    console.error(`SecureStore set failed for ${key}:`, err);
    return false;
  }
}

export async function deleteSecureItem(key: SecureStorageKey): Promise<boolean> {
  if (isWeb) {
    webDelete(key);
    return true;
  }
  try {
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch (err) {
    console.error(`SecureStore delete failed for ${key}:`, err);
    return false;
  }
}

export async function clearAllSecureItems(): Promise<void> {
  if (isWeb) {
    for (const key of Object.values(SecureStorageKeys)) webDelete(key);
    return;
  }
  await Promise.all(Object.values(SecureStorageKeys).map((key) => deleteSecureItem(key)));
}

// --- Non-custodial wallet mnemonic helpers (built on the generic wrapper above) ---

export async function saveEvmMnemonic(mnemonic: string): Promise<boolean> {
  return setSecureItem(SecureStorageKeys.EVM_MNEMONIC, mnemonic);
}

export async function getEvmMnemonic(): Promise<string | null> {
  return getSecureItem(SecureStorageKeys.EVM_MNEMONIC);
}

export async function saveSolMnemonic(mnemonic: string): Promise<boolean> {
  return setSecureItem(SecureStorageKeys.SOL_MNEMONIC, mnemonic);
}

export async function getSolMnemonic(): Promise<string | null> {
  return getSecureItem(SecureStorageKeys.SOL_MNEMONIC);
}

export async function saveTonMnemonic(words: string[]): Promise<boolean> {
  return setSecureItem(SecureStorageKeys.TON_MNEMONIC, JSON.stringify(words));
}

export async function getTonMnemonic(): Promise<string[] | null> {
  const raw = await getSecureItem(SecureStorageKeys.TON_MNEMONIC);
  return raw ? JSON.parse(raw) : null;
}

/** True once all three mnemonic groups are present — i.e. wallet fully set up. */
export async function hasNonCustodialWallet(): Promise<boolean> {
  const [evm, sol, ton] = await Promise.all([getEvmMnemonic(), getSolMnemonic(), getTonMnemonic()]);
  return Boolean(evm && sol && ton);
}
