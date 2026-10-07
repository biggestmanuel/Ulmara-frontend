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
    // Every server-side call has to happen BEFORE the token is wiped below,
    // because the bearer is the only thing identifying the session. Two of
    // them, in this order:
    //
    //  1. the push token, so notifications for this user stop immediately;
    //  2. POST /api/auth/logout, which deletes the Session row server-side.
    //
    // (2) is not a nicety. Without it this function is purely local: the row
    // survives, `requireAuth` still honours it, and the discarded token keeps
    // working for the full JWT_EXPIRES_IN — 7 days by default — after the user
    // believes they have signed out. That is the window a lost or wiped phone
    // leaves behind. It goes after (1) because ending the session first would
    // 401 the push-token removal and leak a registered token.
    //
    // Both are best-effort. The user is signing out regardless, and blocking
    // sign-out on a network failure would be worse than finishing the local
    // teardown — so a failure is logged and the session is left to expire. That
    // is a deliberate, bounded trade: the worst case is the pre-existing
    // behaviour, not a broken sign-out.
    try {
      const { unregisterPushToken } = await import('../lib/push/pushNotifications');
      await unregisterPushToken();
    } catch (err) {
      console.error('Push token cleanup failed during logout:', err);
    }

    try {
      const { logout: endSessionOnServer } = await import('../lib/api/auth');
      await endSessionOnServer();
    } catch (err) {
      // A 401 is the expected shape of a repeat sign-out: the session is already
      // gone, which is the state we wanted. Anything else is a real failure and
      // worth a line in the log — the token is still good on the server until it
      // expires, so this is the difference between a 7-day and a 7-second window.
      const status = (err as { status?: number } | null)?.status;
      if (status !== 401) {
        console.error('Server-side sign-out failed; this token stays valid until it expires:', err);
      }
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
