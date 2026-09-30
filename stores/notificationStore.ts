import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  notificationCopy,
  notificationRoute,
  parseTransactionNotification,
  type TransactionNotificationPayload,
} from '../lib/push/pushNotifications';

const STORAGE_KEY = 'ulmara_notifications_v1';
const MAX_ITEMS = 50;

export interface NotificationItem {
  /** `${type}:${transactionId}` — the idempotency key for dedupe. */
  id: string;
  type: TransactionNotificationPayload['type'];
  title: string;
  body: string;
  tone: 'success' | 'error' | 'neutral';
  transactionId: string;
  route: string;
  receivedAt: string;
  read: boolean;
}

interface NotificationState {
  items: NotificationItem[];
  isHydrated: boolean;
  /** The newest notification received while the app was open, for a banner. */
  banner: NotificationItem | null;

  hydrate: () => Promise<void>;
  /** Returns the item when it was new, or `null` when it was a duplicate. */
  receive: (payload: TransactionNotificationPayload) => NotificationItem | null;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissBanner: () => void;
  clear: () => void;
}

function toItem(payload: TransactionNotificationPayload): NotificationItem {
  const copy = notificationCopy(payload);
  return {
    id: `${payload.type}:${payload.transactionId}`,
    type: payload.type,
    title: copy.title,
    body: copy.body,
    tone: copy.tone,
    transactionId: payload.transactionId,
    route: notificationRoute(payload),
    receivedAt: new Date().toISOString(),
    read: false,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * In-app notification centre.
 *
 * Doubles as the durable record of transaction pushes so the Activity and
 * Notifications screens agree on what arrived, and as the deduplication point
 * for delivery: Expo can redeliver the same push (foreground *and* background
 * handlers both fire on some platforms) and a retry after a lost response can
 * re-trigger a transaction, so every item is keyed on
 * `type:transactionId` and repeats are dropped.
 */
export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  isHydrated: false,
  banner: null,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ isHydrated: true });
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const items = parsed.filter(isNotificationItem).slice(0, MAX_ITEMS);
        set({ items, isHydrated: true });
        return;
      }
    } catch (err) {
      console.error('Failed to restore notifications:', err);
    }
    set({ isHydrated: true });
  },

  receive: (payload) => {
    const item = toItem(payload);
    const existing = get().items.find((entry) => entry.id === item.id);
    if (existing) {
      // Duplicate delivery. Surface the banner only if the user has not already
      // seen it, so a redelivered push cannot re-toast a dismissed alert.
      if (!existing.read && !get().banner) set({ banner: existing });
      return null;
    }
    set((state) => ({
      items: [item, ...state.items].slice(0, MAX_ITEMS),
      banner: item,
    }));
    schedulePersist(get().items);
    return item;
  },

  markRead: (id) => {
    set((state) => {
      const items = state.items.map((item) => (item.id === id ? { ...item, read: true } : item));
      schedulePersist(items);
      return { items, banner: state.banner?.id === id ? null : state.banner };
    });
  },

  markAllRead: () => {
    set((state) => {
      const items = state.items.map((item) => ({ ...item, read: true }));
      schedulePersist(items);
      return { items };
    });
  },

  dismissBanner: () => set({ banner: null }),

  clear: () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    set({ items: [], banner: null, isHydrated: true });
  },
}));

function isNotificationItem(value: unknown): value is NotificationItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<NotificationItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.body === 'string' &&
    typeof item.route === 'string' &&
    typeof item.receivedAt === 'string'
  );
}

// Coalesces bursts (several pushes landing in the same tick) into one write.
function schedulePersist(items: NotificationItem[]): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch((err) => {
      console.error('Failed to persist notifications:', err);
    });
  }, 400);
}

/** Re-exported so listeners can share the parser without a second import. */
export { parseTransactionNotification };
