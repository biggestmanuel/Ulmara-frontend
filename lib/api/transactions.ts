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
  /** UPPERCASE wire identifier ("ETH", "BSC", ...) exactly as listed by the
   *  backend's CHAIN_NAMES enum for /api/transaction/send's zod schema. */
  network: string;
  /** Authorization PIN — verified server-side before the transaction is created. */
  pin: string;
  /**
   * Client-generated UUID, one per transfer attempt. A retry (mobile network
   * timeout-and-retry, double-tap) with the same key returns the original
   * transaction instead of creating a second transfer.
   */
  idempotencyKey: string;
}

export interface SendResult {
  transaction: Transaction;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// The wire row, shared by every transaction endpoint: the create paths
// (`send`, `external/{id}/submit`) and both read paths (`/`, `/{id}`).
//
// Exported because `externalTransfers.ts` maps the submit response through the
// same normalizer rather than keeping a hand-written copy of it, which is what
// this interface's `direction` and `counterpartyAccountId` used to drift from.
export interface BackendTransaction {
  id: string;
  recipientAccountId: string;
  asset: string;
  amount: string;
  network: string;
  feeAmount?: string | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  txHash: string | null;
  createdAt: string;
  /**
   * Required, not optional. All four endpoints send it.
   *
   * These two fields were `?:` with `?? 'sent'` and `?? recipientAccountId`
   * fallbacks, because `POST /api/transaction/send` did not answer with them
   * while the two read paths did. The backend now sends both on the create path
   * too (commit 679b536), so the fallback only masked a regression: if the field
   * ever went missing again, the client would quietly invent a `sent` direction
   * and the row would read as if it were verified against reality.
   *
   * Verified live after the change, on all three shapes: create answers
   * `direction: "sent"` and `counterpartyAccountId: "9259531853"`, and the read
   * paths agree.
   */
  direction: TransactionDirection;
  /** Present on every endpoint. See `direction`. */
  counterpartyAccountId: string;
}

/**
 * Wire status -> app status. `PENDING` and `PROCESSING` both render as
 * `processing`; the row is not done until it carries a hash.
 */
export function normalizeTransaction(transaction: BackendTransaction): Transaction {
  return {
    id: transaction.id,
    direction: transaction.direction,
    status: transaction.status === 'COMPLETED'
      ? 'complete'
      : transaction.status === 'FAILED'
        ? 'failed'
        : 'processing',
    amount: transaction.amount,
    symbol: transaction.asset,
    network: transaction.network,
    counterpartyAccountId: transaction.counterpartyAccountId,
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
    pin: payload.pin,
    idempotencyKey: payload.idempotencyKey,
  });
  return { transaction: normalizeTransaction(data.data) };
}

/**
 * Hands the signed payload to the backend so it can actually queue the transfer.
 *
 * ## Why this is a separate call
 *
 * `sendPayment` returns 201 with the row in `PENDING` and queues nothing. That
 * is the whole point of the split: the server holds the intent, the client signs
 * it locally, and only a signed payload can be broadcast. A row sitting at
 * `PENDING` means this has not happened yet - it is not a stalled transfer, and
 * it is not something to poll into existence.
 *
 * ## Retry-safety comes from the server, not from a key
 *
 * This used to accept an `idempotencyKey` and send it alongside `signedTx`.
 * That was wrong on both counts. The backend body is a strict object containing
 * only `signedTx`, so the extra key was rejected outright:
 *
 *   POST .../broadcast {"signedTx":"0x...","idempotencyKey":"..."}
 *     -> 400 "input: Unrecognized key: \"idempotencyKey\""
 *
 * A retry is safe because the server claims the row atomically - a conditional
 * update that only moves `PENDING` -> `PROCESSING`, so exactly one caller can
 * enqueue no matter how many arrive. Measured: three consecutive broadcasts of
 * the same transaction all return 200 and the row stays `PROCESSING`, with the
 * worker running one job.
 *
 * Once the worker has settled the row the answer becomes
 * 409 "Transaction is no longer awaiting broadcast". That is not a failure to
 * retry through: the transfer is already moving, and the transaction screen
 * reads its real state from `GET /api/transaction/:id`.
 *
 * The idempotency key still matters, but on `sendPayment`, where it is required.
 */
export async function broadcastTransaction(
  transactionId: string,
  signedTx: string
): Promise<Transaction> {
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
  /** Chain the request is denominated on, for callers that already know it. */
  asset?: string;
  symbol?: string;
  amount?: string;
  expiresAt?: string;
  /**
   * Free text from the requester. Trimmed before it is sent, and left out of
   * the body entirely when it is blank.
   */
  note?: string;
}

export interface PaymentRequestResult {
  requestId: string;
  link: string;
}

export async function createPaymentRequest(
  payload: PaymentRequestPayload
): Promise<PaymentRequestResult> {
  // The note is optional and a blank one means "no note", so the key is dropped
  // rather than sent as `note: ""`. The body is validated strictly, and an
  // absent key and a present-but-empty one are not the same request. Keys the
  // caller did not supply are dropped for the same reason, instead of riding
  // along as explicit `undefined`.
  const note = payload.note?.trim() ?? '';
  const body: PaymentRequestPayload = {};
  if (payload.asset !== undefined) body.asset = payload.asset;
  if (payload.symbol !== undefined) body.symbol = payload.symbol;
  if (payload.amount !== undefined) body.amount = payload.amount;
  if (payload.expiresAt !== undefined) body.expiresAt = payload.expiresAt;
  if (note !== '') body.note = note;

  const { data } = await apiClient.post<ApiEnvelope<PaymentRequestResult>>(
    '/api/payment/request',
    body
  );
  return data.data;
}

export interface PaymentLink {
  id: string;
  status: 'OPEN' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
  amount?: string | null;
  /**
   * Chain the request is denominated on, e.g. "ETH". Live rows carry both
   * `asset` and `symbol`, and the two hold the same value here - the field is
   * declared because the response includes it, not because anything reads it.
   * Treat `symbol` as the one to display.
   */
  asset?: string | null;
  symbol?: string | null;
  note?: string | null;
  requesterAccountId: string;
  requesterName?: string | null;
  expiresAt?: string | null;
}

export async function getPaymentLink(id: string): Promise<PaymentLink> {
  const { data } = await apiClient.get<ApiEnvelope<PaymentLink>>(`/api/payment/request/${id}`);
  return data.data;
}

// Fulfilling a payment link proves an existing completed transaction;
// the backend requires its UUID. NOTE: the current backend contract for
// POST /api/payment/request/:id/fulfill is { transactionId: UUID } — an
// in-app flow that creates the payment transaction first must pass its id
// here (amount/symbol/network are not accepted by this endpoint).
export async function fulfillPaymentLink(id: string, transactionId: string): Promise<SendResult> {
  const { data } = await apiClient.post<ApiEnvelope<BackendTransaction>>(
    `/api/payment/request/${id}/fulfill`,
    { transactionId },
  );
  return { transaction: normalizeTransaction(data.data) };
}
