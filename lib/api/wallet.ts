import { apiClient } from './client';
import type { ChainId } from '../chains';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface WalletAddress {
  chain: string;
  address: string;
}

export interface WalletBalance {
  chain: string;
  address: string;
  balance: string | null;
}

export async function fetchWalletAddresses(): Promise<WalletAddress[]> {
  const { data } = await apiClient.get<ApiEnvelope<WalletAddress[]>>('/api/wallet/addresses');
  return data.data;
}

export async function fetchWalletBalances(): Promise<WalletBalance[]> {
  const { data } = await apiClient.get<ApiEnvelope<WalletBalance[]>>('/api/wallet/balances');
  return data.data;
}

export function toFrontendChainId(chain: string): ChainId | null {
  const normalized = chain.toLowerCase();
  return ['eth', 'bsc', 'base', 'polygon', 'sol', 'tron', 'ton'].includes(normalized)
    ? normalized as ChainId
    : null;
}