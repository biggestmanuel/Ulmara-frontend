import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Requires: npm install @react-native-async-storage/async-storage
// Non-sensitive settings only — nothing here belongs in SecureStore.

const STORAGE_KEY = 'ulmara_preferences_v1';

export type Currency = 'USD' | 'NGN' | 'EUR' | 'GBP';
export type Language = 'English' | 'French' | 'Portuguese';
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
  language: Language;
  defaultNetwork: DefaultNetwork;
  notifications: NotificationPrefs;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  setCurrency: (c: Currency) => void;
  setLanguage: (l: Language) => void;
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

async function persist(state: Pick<PreferencesState, 'currency' | 'language' | 'defaultNetwork' | 'notifications'>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to persist preferences:', err);
  }
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  currency: 'USD',
  language: 'English',
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
          language: parsed.language ?? 'English',
          defaultNetwork: parsed.defaultNetwork ?? 'Auto (Recommended)',
          notifications: { ...DEFAULT_NOTIFICATIONS, ...parsed.notifications },
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
  setLanguage: (language) => {
    set({ language });
    persist({ ...get(), language });
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
