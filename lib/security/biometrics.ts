import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import {
  getSecureItem,
  setSecureItem,
  deleteSecureItem,
  SecureStorageKeys,
} from '../storage/secureStorage';

/**
 * Device-biometric integration.
 *
 * Security model (unchanged from the pre-biometric app):
 *  - The 6-digit PIN is the *only* credential the server ever accepts, is
 *    verified server-side against `User.pinHash`, and is never cached on the
 *    device. Lockout rules (5 attempts -> 15 minute cooldown) are untouched.
 *  - Biometrics are a *convenience* gate layered in front of the app, never a
 *    replacement credential. Nothing biometric is ever stored or transmitted:
 *    the only persisted value is a boolean preference in SecureStore plus the
 *    device's own "last enrolled biometrics" marker, used to detect when the
 *    user changes or removes their Face ID / fingerprint.
 */

/** Outcomes we branch on. Everything else collapses to 'failed'. */
export type BiometricOutcome =
  | 'success'
  /** The user dismissed the system sheet. Not an error — silently fall back. */
  | 'cancelled'
  /** User tapped the system's "Use PIN" / passcode fallback. */
  | 'fallback'
  /** No hardware, or hardware present but disabled. */
  | 'unavailable'
  /** Hardware exists but nothing is enrolled. */
  | 'not_enrolled'
  /** Too many failed biometric attempts; the sensor is temporarily locked. */
  | 'lockout'
  /** Wrong finger / face. */
  | 'failed'
  /** Anything we could not classify. */
  | 'unknown';

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** Face ID, fingerprint, iris — whichever the OS reports. */
  types: LocalAuthentication.AuthenticationType[];
  /** Human label for the available method, e.g. "Face ID" / "Fingerprint". */
  label: string;
  /** True when biometrics can actually be used right now. */
  canUse: boolean;
  /** Why biometrics cannot be used, for UI copy. `null` when canUse. */
  blockedReason: string | null;
}

/** "Face ID" on iOS, "Fingerprint" on Android — never both. */
export function biometricLabel(types: LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Fingerprint';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'Iris';
  return Platform.OS === 'ios' ? 'Face ID' : 'Fingerprint';
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  // `*Async` calls reject on some Android OEM builds when no hardware is
  // present at all, so every probe is individually guarded.
  const [hasHardware, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync().catch(() => false),
    LocalAuthentication.isEnrolledAsync().catch(() => false),
    LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => [] as LocalAuthentication.AuthenticationType[]),
  ]);

  let blockedReason: string | null = null;
  if (!hasHardware) {
    blockedReason = 'This device does not have Face ID or fingerprint hardware.';
  } else if (!isEnrolled) {
    blockedReason = 'No Face ID or fingerprint is set up on this device yet. Add one in your device settings first.';
  } else if (types.length === 0) {
    blockedReason = 'This device has no usable biometric method configured.';
  }

  return {
    hasHardware,
    isEnrolled,
    types,
    label: biometricLabel(types),
    canUse: blockedReason === null,
    blockedReason,
  };
}

function classify(error: string | undefined): BiometricOutcome {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return 'cancelled';
    case 'user_fallback':
      return 'fallback';
    case 'not_available':
    case 'biometry_not_available':
    case 'passcode_not_set':
      return 'unavailable';
    case 'not_enrolled':
    case 'biometry_not_enrolled':
      return 'not_enrolled';
    case 'lockout':
    case 'biometry_lockout':
      return 'lockout';
    case 'authentication_failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

/** Copy shown to the user for a non-success outcome. `null` when cancelled. */
export function describeOutcome(outcome: BiometricOutcome): string | null {
  switch (outcome) {
    case 'cancelled':
    case 'fallback':
      return null;
    case 'unavailable':
      return 'Biometric unlock is not available on this device. Use your PIN instead.';
    case 'not_enrolled':
      return 'No Face ID or fingerprint is enrolled on this device. Add one in your device settings, or keep using your PIN.';
    case 'lockout':
      return 'Too many failed biometric attempts. Unlock your device with its passcode, then try again.';
    case 'failed':
      return "We couldn't verify it was you. Try again or use your PIN.";
    case 'unknown':
      return 'Biometric check did not complete. Use your PIN instead.';
    default:
      return null;
  }
}

export interface AuthenticateOptions {
  promptTitle?: string;
  promptSubtitle?: string;
  promptCancelLabel?: string;
  /** "Use Passcode" on iOS after repeated failures. Blank disables the button. */
  fallbackLabel?: string;
  /** When true, a passcode is not accepted as a fallback — we handle it. */
  disableDeviceFallback?: boolean;
}

/**
 * Runs a biometric check. Resolves with the outcome instead of throwing so
 * callers can render a specific state (cancellation is not an error).
 */
export async function authenticateWithBiometrics(
  options: AuthenticateOptions = {}
): Promise<BiometricOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: options.promptTitle ?? 'Unlock Ulmara',
      promptSubtitle: options.promptSubtitle,
      cancelLabel: options.promptCancelLabel ?? 'Cancel',
      fallbackLabel: options.fallbackLabel ?? 'Use PIN',
      disableDeviceFallback: options.disableDeviceFallback ?? false,
    });
    return result.success ? 'success' : classify(result.error);
  } catch (err) {
    console.warn('Biometric authentication threw:', err);
    return 'unknown';
  }
}

/**
 * Marker for the enrollment we last successfully verified against.
 *
 * `AuthenticationType` is a bitmask, and iOS rotates it when the user adds or
 * removes a face/finger. Storing the mask lets us detect "you changed your
 * biometrics" and fall back to the PIN instead of failing the check with a
 * confusing OS error. This is *not* biometric data — it is a public
 * capability bitmask, and it never leaves the device.
 */
const enrollmentSignature = (types: LocalAuthentication.AuthenticationType[]): string =>
  [...types].sort((a, b) => a - b).join('-');

async function readEnrollment(): Promise<string | null> {
  return getSecureItem(SecureStorageKeys.BIOMETRIC_ENROLLMENT);
}

/**
 * Called on every app unlock. Returns `true` when the stored preference is
 * still trustworthy. A changed or removed enrollment silently disables the
 * preference (PIN remains the fallback) rather than leaving the user on a
 * screen whose only button can never succeed.
 */
export async function reconcileBiometricPreference(): Promise<{
  enabled: boolean;
  /** True when biometrics were switched off *for the user* by this check. */
  autoDisabled: boolean;
  reason: string | null;
}> {
  const stored = await getSecureItem(SecureStorageKeys.BIOMETRIC_ENABLED);
  if (stored !== 'true') return { enabled: false, autoDisabled: false, reason: null };

  const capability = await getBiometricCapability();
  const storedSignature = await readEnrollment();

  if (!capability.canUse) {
    await setBiometricEnabled(false);
    return {
      enabled: false,
      autoDisabled: true,
      reason: capability.blockedReason ?? 'Biometric unlock is no longer available on this device.',
    };
  }

  if (storedSignature && storedSignature !== enrollmentSignature(capability.types)) {
    await setBiometricEnabled(false);
    return {
      enabled: false,
      autoDisabled: true,
      reason: 'Your Face ID or fingerprint changed, so biometric unlock was turned off. Use your PIN instead.',
    };
  }

  return { enabled: true, autoDisabled: false, reason: null };
}

/** Persists the preference *and* the enrollment marker used for drift detection. */
export async function setBiometricEnabled(
  enabled: boolean,
  types?: LocalAuthentication.AuthenticationType[]
): Promise<void> {
  if (!enabled) {
    await Promise.all([
      setSecureItem(SecureStorageKeys.BIOMETRIC_ENABLED, 'false'),
      deleteSecureItem(SecureStorageKeys.BIOMETRIC_ENROLLMENT),
    ]);
    return;
  }
  await Promise.all([
    setSecureItem(SecureStorageKeys.BIOMETRIC_ENABLED, 'true'),
    setSecureItem(
      SecureStorageKeys.BIOMETRIC_ENROLLMENT,
      enrollmentSignature(types ?? (await LocalAuthentication.supportedAuthenticationTypesAsync()))
    ),
  ]);
}

/** Whether the user has opted into biometric unlock on this device. */
export async function isBiometricPreferenceEnabled(): Promise<boolean> {
  return (await getSecureItem(SecureStorageKeys.BIOMETRIC_ENABLED)) === 'true';
}
