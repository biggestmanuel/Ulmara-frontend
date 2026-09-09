import { create } from 'zustand';
import { getSecureItem, setSecureItem, clearAllSecureItems, SecureStorageKeys } from '../lib/storage/secureStorage';
import { getMe } from '../lib/api/accountId';
import { useAuthGateStore } from './authGateStore';

// Own-profile shape from GET /api/account/me — richer than the public
// AccountIdProfile lookup (which only exposes name/photoUrl for other users).
export interface OwnProfile {
  name?: string | null;
  email?: string;
  photoUrl?: string | null;
}

interface UserState {
  accountId: string | null;
  profile: OwnProfile | null;
  biometricEnabled: boolean;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  setSession: (accountId: string, sessionToken: string) => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  accountId: null,
  profile: null,
  biometricEnabled: false,
  isHydrated: false,

  hydrate: async () => {
    const [accountId, biometricFlag] = await Promise.all([
      getSecureItem(SecureStorageKeys.ACCOUNT_ID),
      getSecureItem(SecureStorageKeys.BIOMETRIC_ENABLED),
    ]);

    if (!accountId) {
      set({ isHydrated: true });
      return;
    }

    let profile: OwnProfile | null = null;
    try {
      // Own profile — includes email, unlike the public account-id lookup.
      const me = await getMe();
      profile = { name: me?.name, email: me?.email, photoUrl: me?.photoUrl };
    } catch (err) {
      console.error('Failed to fetch profile during hydrate:', err);
    }

    set({
      accountId,
      profile,
      biometricEnabled: biometricFlag === 'true',
      isHydrated: true,
    });
  },

  setSession: async (accountId, sessionToken) => {
    await Promise.all([
      setSecureItem(SecureStorageKeys.ACCOUNT_ID, accountId),
      setSecureItem(SecureStorageKeys.SESSION_TOKEN, sessionToken),
    ]);
    set({ accountId });
  },

  setBiometricEnabled: async (enabled) => {
    await setSecureItem(SecureStorageKeys.BIOMETRIC_ENABLED, String(enabled));
    set({ biometricEnabled: enabled });
  },

  logout: async () => {
    await clearAllSecureItems();
    // Otherwise a re-login in the same app session (no process restart)
    // would inherit the stale pinVerified=true from before logout and skip
    // PIN entry entirely.
    useAuthGateStore.getState().resetPinVerified();
    set({ accountId: null, profile: null, biometricEnabled: false });
  },
}));
