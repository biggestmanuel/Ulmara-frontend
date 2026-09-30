import { create } from 'zustand';
import { getSecureItem, setSecureItem, clearAllSecureItems, SecureStorageKeys } from '../lib/storage/secureStorage';
import { getMe } from '../lib/api/accountId';
import { clearCachedSessionToken, setCachedSessionToken } from '../lib/api/client';
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
    setCachedSessionToken(sessionToken);
    set({ accountId });
  },

  setBiometricEnabled: async (enabled) => {
    await setSecureItem(SecureStorageKeys.BIOMETRIC_ENABLED, String(enabled));
    set({ biometricEnabled: enabled });
  },

  logout: async () => {
    // Release the server-side push token before the session token is wiped —
    // unregistering needs an authenticated request, so it has to happen first
    // (best-effort: a failure here must not block sign-out). Dynamic import
    // avoids a static cycle (push -> client -> storage, userStore -> push).
    try {
      const { unregisterPushToken } = await import('../lib/push/pushNotifications');
      await unregisterPushToken();
    } catch (err) {
      console.error('Push token cleanup failed during logout:', err);
    }

    await clearAllSecureItems();
    // Drop the API client's cached bearer token too — otherwise the very next
    // request after sign-out would still carry the old session.
    clearCachedSessionToken();
    // Otherwise a re-login in the same app session (no process restart)
    // would inherit the stale pinVerified=true from before logout and skip
    // PIN entry entirely.
    useAuthGateStore.getState().resetPinVerified();
    // Re-run the gate so its status actually flips to 'guest'. Without this the
    // store still reports 'authed' and the root layout's redirect effect
    // bounces the user straight back from /(auth)/welcome to /(tabs)/home.
    await useAuthGateStore.getState().check();
    // Also clear in-memory wallet/tx state so a different account logging in
    // on the same device never flashes the previous user's balances or
    // transactions. Dynamic import avoids a static store-import cycle.
    const { useWalletStore } = await import('./walletStore');
    const { useTxStore } = await import('./txStore');
    const { useNotificationStore } = await import('./notificationStore');
    useWalletStore.setState({ addresses: {}, balances: [], isHydrated: false, isLoadingBalances: false });
    useTxStore.setState({ items: [], nextCursor: null, isLoading: false, isLoadingMore: false });
    useNotificationStore.getState().clear();
    set({ accountId: null, profile: null, biometricEnabled: false });
  },
}));
