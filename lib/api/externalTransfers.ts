import { apiClient } from './client';
import type { Transaction } from './transactions';

interface ApiEnvelope<T> { success: boolean; data: T }

export interface ExternalTransferIntent {
  id: string;
  chain: string;
  asset: string;
  amount: string;
  to: string;
  fee: string;
  status: 'READY' | 'SUBMITTED' | 'FAILED';
}

export async function prepareExternalTransfer(input: {
  chain: string;
  asset: string;
  amount: string;
  to: string;
}): Promise<ExternalTransferIntent> {
  const { data } = await apiClient.post<ApiEnvelope<ExternalTransferIntent>>('/api/transaction/external/prepare', input);
  return data.data;
}

export async function submitExternalTransfer(intentId: string, signedTransaction: string): Promise<Transaction> {
  const { data } = await apiClient.post<ApiEnvelope<Transaction>>(`/api/transaction/external/${intentId}/submit`, { signedTransaction });
  return data.data;
}
