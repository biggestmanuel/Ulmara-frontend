import { apiClient } from './client';
import type { BackendTransaction, Transaction } from './transactions';

interface ApiEnvelope<T> { success: boolean; data: T }

export type ExternalIntentStatus = 'READY' | 'USED';

export interface ExternalTransferIntent {
  id: string;
  chain: string;
  asset: string;
  amount: string;
  to: string;
  fee: string;
  status: ExternalIntentStatus;
}

// The submit endpoint returns the created ledger row in the same "sent"
// shape as transactionService.list/getById.
interface BackendSubmitResponse extends BackendTransaction {
  direction?: 'sent' | 'received';
  counterpartyAccountId?: string;
}

export async function prepareExternalTransfer(input: {
  chain: string;
  asset: string;
  amount: string;
  to: string;
  /** Authorization PIN — verified server-side with the same lockout as internal transfers. */
  pin: string;
}): Promise<ExternalTransferIntent> {
  const { data } = await apiClient.post<ApiEnvelope<ExternalTransferIntent>>('/api/transaction/external/prepare', input);
  return data.data;
}

export async function submitExternalTransfer(intentId: string, signedTransaction: string): Promise<Transaction> {
  const { data } = await apiClient.post<ApiEnvelope<BackendSubmitResponse>>(
    `/api/transaction/external/${intentId}/submit`,
    { signedTransaction },
  );
  const backend = data.data;
  return {
    id: backend.id,
    direction: backend.direction ?? 'sent',
    status: backend.status === 'COMPLETED' ? 'complete' : backend.status === 'FAILED' ? 'failed' : 'processing',
    amount: backend.amount,
    symbol: backend.asset,
    network: backend.network,
    counterpartyAccountId: backend.counterpartyAccountId ?? backend.recipientAccountId,
    fee: backend.feeAmount ?? '0',
    txHash: backend.txHash,
    createdAt: backend.createdAt,
  };
}
