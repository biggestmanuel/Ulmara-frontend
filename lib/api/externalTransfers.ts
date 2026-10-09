import { apiClient } from './client';
import { normalizeTransaction, type BackendTransaction, type Transaction } from './transactions';

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

// The submit endpoint returns the created ledger row in the same shape as
// `send` and both read paths, so `BackendTransaction` describes it exactly and
// nothing needs extending. This used to redeclare `direction` and
// `counterpartyAccountId` as optional and carry a hand-written copy of the
// normalizer, which is how the two drifted apart in the first place.

export async function prepareExternalTransfer(input: {
  /** UPPERCASE wire identifier exactly as listed by the backend's CHAIN_NAMES
   *  enum ("ETH", "BSC", "BASE", "POLYGON", "TRON", "SOL", "TON", "BTC") —
   *  lowercase values are rejected with 400 by the prepare endpoint. */
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

// The key identifies the submit attempt: a retry after a lost response
// returns the original transaction instead of creating a second ledger row.
export async function submitExternalTransfer(
  intentId: string,
  signedTransaction: string,
  idempotencyKey: string
): Promise<Transaction> {
  const { data } = await apiClient.post<ApiEnvelope<BackendTransaction>>(
    `/api/transaction/external/${intentId}/submit`,
    { signedTransaction, idempotencyKey },
  );
  // The shared normalizer, not a copy of it. The copy had already drifted: it
  // kept the `?? 'sent'` and `?? recipientAccountId` fallbacks after
  // `transactions.ts` had moved on, so the two endpoints disagreed about what a
  // missing field meant.
  return normalizeTransaction(data.data);
}
