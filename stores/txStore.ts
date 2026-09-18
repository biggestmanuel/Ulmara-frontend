import { create } from 'zustand';
import { fetchTransactions, Transaction } from '../lib/api/transactions';
import { toApiError } from '../lib/api/client';
import { useUserStore } from './userStore';
import { useAuthGateStore } from './authGateStore';

interface TxState {
  items: Transaction[];
  nextCursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;

  fetchInitial: () => Promise<void>;
  fetchMore: () => Promise<void>;
  handleFetchError: (err: unknown) => Promise<void>;
  upsertTransaction: (tx: Transaction) => void;
}

export const useTxStore = create<TxState>((set, get) => ({
  items: [],
  nextCursor: null,
  isLoading: false,
  isLoadingMore: false,

  handleFetchError: async (err: unknown) => {
    const apiError = toApiError(err);
    if (apiError.status === 401) {
      await useUserStore.getState().logout();
      await useAuthGateStore.getState().check();
      return;
    }
    console.error('Failed to fetch transactions:', apiError);
  },

  fetchInitial: async () => {
    set({ isLoading: true });
    try {
      const { items, nextCursor } = await fetchTransactions({ limit: 30 });
      set({ items, nextCursor });
    } catch (err) {
      await get().handleFetchError(err);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchMore: async () => {
    const { nextCursor, isLoadingMore, items } = get();
    if (!nextCursor || isLoadingMore) return;

    set({ isLoadingMore: true });
    try {
      const result = await fetchTransactions({ cursor: nextCursor, limit: 30 });
      set({ items: [...items, ...result.items], nextCursor: result.nextCursor });
    } catch (err) {
      await get().handleFetchError(err);
    } finally {
      set({ isLoadingMore: false });
    }
  },

  // Used for optimistic updates / live status changes (e.g. a send just
  // submitted, or a webhook-driven status flip from processing to complete)
  upsertTransaction: (tx) => {
    set((state) => {
      const exists = state.items.some((item) => item.id === tx.id);
      const items = exists
        ? state.items.map((item) => (item.id === tx.id ? tx : item))
        : [tx, ...state.items];
      return { items };
    });
  },
}));
