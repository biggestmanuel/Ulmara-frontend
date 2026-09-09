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
  pushTransactions: boolean;
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
}

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  pushTransactions: true,
  pushSecurity: true,
  pushPriceAlerts: false,
  emailReceipts: true,
  emailProduct: false,
};

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
    set({ notifications });
    persist({ ...get(), notifications });
  },
}));
