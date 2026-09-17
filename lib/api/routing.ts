import { apiClient } from './client';
import type { ChainId } from '../chains';

export interface RouteQuote {
  network: ChainId;
  label: string;
  estimatedFeeUsd: number;
  estimatedSeconds: number;
  available: boolean;
  unavailableReason?: string;
}

export async function fetchRouteQuotes(input: {
  asset: string;
  amount: string;
  recipientAccountId: string;
}): Promise<RouteQuote[]> {
  const { data } = await apiClient.post<{ data: RouteQuote[] }>('/api/routing/quotes', input);
  return data.data;
}
