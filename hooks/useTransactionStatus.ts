import { useEffect, useRef, useState } from 'react';
import { fetchTransactionById } from '../lib/api/transactions';

// Assumes txStore exposes: transactions, upsertTransaction(tx)
// Polls the API while a tx is in a non-final state (Processing)

type TxStatus = 'processing' | 'complete' | 'failed';

const POLL_INTERVAL_MS = 4000;

export function useTransactionStatus(txId: string) {
  const [transaction, setTransaction] = useState<
    Awaited<ReturnType<typeof fetchTransactionById>> | undefined
  >();
  const [status, setStatus] = useState<TxStatus | undefined>();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!txId) return;

    const poll = async () => {
      try {
        const tx = await fetchTransactionById(txId);
        setTransaction(tx);
        setStatus(tx.status);
        if (tx.status !== 'processing' && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch {
        // keep last known status on transient failure
      }
    };

    poll();

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [txId]);

  return {
    transaction,
    status,
    isPending: status === 'processing',
  };
}
