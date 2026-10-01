import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Requires: npm install @react-native-async-storage/async-storage
// Non-sensitive settings only — nothing here belongs in SecureStore.

const STORAGE_KEY = 'ulmara_preferences_v1';

export type Currency = 'USD' | 'NGN' | 'EUR' | 'GBP';
export type DefaultNetwork =
  | 'Auto (Recommended)' | 'TON' | 'BSC' | 'ETH' | 'SOL' | 'Base' | 'Polygon' | 'TRON';

export interface NotificationPrefs {
  /** Master switch for transaction pushes. */
  pushTransactions: boolean;
  /** Incoming transfer received. */
  pushReceived: boolean;
  /** Outgoing transfer confirmed on the network. */
  pushSentConfirmed: boolean;
  /** Outgoing transfer failed. */
  pushSentFailed: boolean;
  pushSecurity: boolean;
  pushPriceAlerts: boolean;
  emailReceipts: boolean;
  emailProduct: boolean;
}

interface PreferencesState {
  currency: Currency;
  defaultNetwork: DefaultNetwork;
  notifications: NotificationPrefs;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  setCurrency: (c: Currency) => void;
  setDefaultNetwork: (n: DefaultNetwork) => void;
  setNotification: (key: keyof NotificationPrefs, value: boolean) => void;
  /** Whether a given backend push event should surface on this device. */
  isTransactionEventEnabled: (
    type: 'transfer.received' | 'transfer.sent.confirmed' | 'transfer.sent.failed'
  ) => boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  pushTransactions: true,
  // All three transaction events default on — a user who turns on transaction
  // notifications should not have to enable each one separately.
  pushReceived: true,
  pushSentConfirmed: true,
  pushSentFailed: true,
  pushSecurity: true,
  pushPriceAlerts: false,
  emailReceipts: true,
  emailProduct: false,
};

/** Maps a backend push event to the device-local toggle that governs it. */
const EVENT_PREFERENCE: Record<
  'transfer.received' | 'transfer.sent.confirmed' | 'transfer.sent.failed',
  'pushReceived' | 'pushSentConfirmed' | 'pushSentFailed'
> = {
  'transfer.received': 'pushReceived',
  'transfer.sent.confirmed': 'pushSentConfirmed',
  'transfer.sent.failed': 'pushSentFailed',
};

function isTransactionEventEnabled(
  notifications: NotificationPrefs,
  type: 'transfer.received' | 'transfer.sent.confirmed' | 'transfer.sent.failed'
): boolean {
  if (!notifications.pushTransactions) return false;
  return notifications[EVENT_PREFERENCE[type]];
}

async function persist(
  state: Pick<PreferencesState, 'currency' | 'defaultNetwork' | 'notifications'>
) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // The in-memory state is already updated, so the setting works for this
    // session; it just will not survive a restart. Worth a log, not worth
    // interrupting the user over.
    console.error('Failed to persist preferences:', err);
  }
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  currency: 'USD',
  defaultNetwork: 'Auto (Recommended)',
  notifications: DEFAULT_NOTIFICATIONS,
  isHydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          currency: parsed.currency ?? 'USD',
          defaultNetwork: parsed.defaultNetwork ?? 'Auto (Recommended)',
          notifications: { ...DEFAULT_NOTIFICATIONS, ...parsed.notifications },
          // A stored `language` from an older build is deliberately ignored
          // rather than read: there is no longer anywhere to display it.
        });
      }
    } catch (err) {
      console.error('Failed to hydrate preferences:', err);
    } finally {
      set({ isHydrated: true });
    }
  },

  setCurrency: (currency) => {
    set({ currency });
    persist({ ...get(), currency });
  },
  setDefaultNetwork: (defaultNetwork) => {
    set({ defaultNetwork });
    persist({ ...get(), defaultNetwork });
  },
  setNotification: (key, value) => {
    const notifications = { ...get().notifications, [key]: value };
    // The master switch is the union of the three transaction events, so
    // turning it off clears the individual toggles rather than leaving the UI
    // showing "on" switches that would never fire.
    if (key === 'pushTransactions' && !value) {
      notifications.pushReceived = false;
      notifications.pushSentConfirmed = false;
      notifications.pushSentFailed = false;
    }
    set({ notifications });
    persist({ ...get(), notifications });
  },

  isTransactionEventEnabled: (type) => isTransactionEventEnabled(get().notifications, type),
}));
