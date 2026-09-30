import { create } from 'zustand';
import { getSecureItem, SecureStorageKeys } from '../lib/storage/secureStorage';
import { setCachedSessionToken } from '../lib/api/client';

export type AuthGateStatus = 'checking' | 'authed' | 'locked' | 'guest';

interface AuthGateState {
  status: AuthGateStatus;
  // Deliberately NOT persisted to SecureStore or anywhere else — resets to
  // false on every fresh JS process (cold start, app kill+reopen). This is
  // what makes PIN entry mandatory every time the app is opened, not just
  // once per device, without needing to cache the PIN or its hash on-device.
  pinVerified: boolean;
  // True once the server has told us this account has no PIN at all
  // (`verify-pin` -> 409 "No PIN set for this account"). In-memory only, like
  // `pinVerified`.
  //
  // This exists because the gate's 'locked' state means "session + account id
  // present, PIN not proven this launch", and the root layout pins the user to
  // verify-pin whenever it holds. For an account that never set a PIN that is a
  // dead end: there is nothing to type that can succeed. The flag lets the
  // layout route to create-pin instead, and is cleared the moment a PIN exists.
  pinMissing: boolean;
  check: () => Promise<void>;
  markPinVerified: () => Promise<void>;
  markPinMissing: () => void;
  resetPinVerified: () => void;
}

// Single source of truth for auth gate status. Shared between the root
// layout (which redirects based on it) and onboarding/login screens (which
// need to flip it the moment they persist the required SecureStore keys or
// verify the PIN, instead of waiting for the next app launch).
//
// Three real states below 'checking':
//  - 'guest'  — no session / no account id locally. Needs full onboarding.
//  - 'locked' — session + account id ARE present (this device/account has
//    already onboarded), but the PIN hasn't been verified yet THIS launch.
//    Route to verify-pin, not welcome/signup.
//  - 'authed' — session + account id + PIN verified this launch.
//
// PIN itself is never cached or checked on-device (verified server-side
// against User.pinHash) — same model as OPay/PalmPay/Moniepoint. Only the
// fact that it was verified this session lives here, in memory only.
export const useAuthGateStore = create<AuthGateState>((set, get) => ({
  status: 'checking',
  pinVerified: false,
  pinMissing: false,
  check: async () => {
    try {
      // Through the wrapper, never expo-secure-store directly: the wrapper is
      // the single place that knows which platform provides a real keystore.
      const [session, accountId] = await Promise.all([
        getSecureItem(SecureStorageKeys.SESSION_TOKEN),
        getSecureItem(SecureStorageKeys.ACCOUNT_ID),
      ]);
      if (!session || !accountId) {
        // Keep the API client's in-memory token in step with what SecureStore
        // actually holds, so a logout cannot leave a token being attached to
        // requests for the rest of the process.
        setCachedSessionToken(session);
        set({ status: 'guest', pinVerified: false, pinMissing: false });
      } else {
        setCachedSessionToken(session);
        set({ status: get().pinVerified ? 'authed' : 'locked' });
      }
    } catch (err) {
      // Fail closed — treat any secure-store read error as unauthenticated
      console.error('Auth gate check failed:', err);
      set({ status: 'guest', pinVerified: false, pinMissing: false });
    }
  },
  markPinVerified: async () => {
    // A PIN demonstrably exists now, so the "no PIN on this account" state is
    // over whether or not this launch is the one that discovered it.
    set({ pinVerified: true, pinMissing: false });
    await get().check();
  },
  markPinMissing: () => set({ pinMissing: true }),
  resetPinVerified: () => set({ pinVerified: false, pinMissing: false }),
}));
