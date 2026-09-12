import { apiClient } from './client';

export type TransactionDirection = 'sent' | 'received';
export type TransactionStatus = 'processing' | 'complete' | 'failed';

export interface Transaction {
  id: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  amount: string;
  symbol: string;
  network: string;
  counterpartyAccountId: string;
  fee: string;
  txHash: string | null;
  createdAt: string;
}

export interface SendPayload {
  recipientAccountId: string;
  amount: string;
  symbol: string;
  network: string;
}

export interface SendResult {
  transaction: Transaction;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface BackendTransaction {
  id: string;
  recipientAccountId: string;
  asset: string;
  amount: string;
  network: string;
  feeAmount?: string | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  txHash: string | null;
  createdAt: string;
  direction?: TransactionDirection;
  counterpartyAccountId?: string;
}

function normalizeTransaction(transaction: BackendTransaction): Transaction {
  return {
    id: transaction.id,
    direction: transaction.direction ?? 'sent',
    status: transaction.status === 'COMPLETED'
      ? 'complete'
      : transaction.status === 'FAILED'
        ? 'failed'
        : 'processing',
    amount: transaction.amount,
    symbol: transaction.asset,
    network: transaction.network,
    counterpartyAccountId: transaction.counterpartyAccountId ?? transaction.recipientAccountId,
    fee: transaction.feeAmount ?? '0',
    txHash: transaction.txHash,
    createdAt: transaction.createdAt,
  };
}

export async function sendPayment(payload: SendPayload): Promise<SendResult> {
  const { data } = await apiClient.post<ApiEnvelope<BackendTransaction>>('/api/transaction/send', {
    recipientAccountId: payload.recipientAccountId,
    asset: payload.symbol,
    amount: payload.amount,
    network: payload.network,
  });
  return { transaction: normalizeTransaction(data.data) };
}

export async function broadcastTransaction(transactionId: string, signedTx: string): Promise<Transaction> {
  const { data } = await apiClient.post<ApiEnvelope<BackendTransaction>>(
    `/api/transaction/${transactionId}/broadcast`,
    { signedTx },
  );
  return normalizeTransaction(data.data);
}

export async function fetchTransactions(params?: { cursor?: string; limit?: number }) {
  const { data } = await apiClient.get<ApiEnvelope<{ items: BackendTransaction[]; page: number; limit: number; total: number }>>(
    '/api/transaction',
    { params: { page: params?.cursor ?? '1', limit: params?.limit ?? 20 } }
  );
  const page = data.data.page;
  const limit = data.data.limit;
  const hasMore = page * limit < data.data.total;
  return {
    items: data.data.items.map(normalizeTransaction),
    nextCursor: hasMore ? String(page + 1) : null,
  };
}

export async function fetchTransactionById(id: string): Promise<Transaction> {
  const { data } = await apiClient.get<ApiEnvelope<BackendTransaction>>(`/api/transaction/${id}`);
  return normalizeTransaction(data.data);
}

export interface PaymentRequestPayload {
  amount?: string;
  symbol?: string;
  note?: string;
}

export interface PaymentRequestResult {
  requestId: string;
  link: string;
}

export async function createPaymentRequest(
  payload: PaymentRequestPayload
): Promise<PaymentRequestResult> {
  const { data } = await apiClient.post<ApiEnvelope<PaymentRequestResult>>('/api/payment/request', payload);
  return data.data;
}
