import { apiClient } from './client';

export interface RouteQuote {
  /** UPPERCASE wire identifier (backend CHAIN_NAMES convention, e.g. "ETH") —
   *  the same value confirm.tsx forwards to /transaction/send. Convert to the
   *  lowercase internal ChainId only for client-side adapter lookups. */
  network: string;
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
