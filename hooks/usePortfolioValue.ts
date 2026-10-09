import { useEffect, useMemo, useRef, useState } from 'react';

import { getUsdPrices, usdToNgn, type PriceSymbol } from '../lib/prices/coingecko';
import { useWalletStore, type AssetBalance } from '../stores/walletStore';

export interface PortfolioValue {
  /** Total across every asset, in USD. `null` until prices load or on failure. */
  usd: number | null;
  /** Same total in NGN. `null` when the fiat rate is unavailable. */
  ngn: number | null;
  isLoading: boolean;
  /** Non-fatal: prices could not be fetched this cycle. */
  error: string | null;
}

const KNOWN_PRICE_SYMBOLS = new Set<string>([
  'ETH', 'BNB', 'POL', 'SOL', 'TRX', 'TON', 'BTC', 'USDT', 'USDC',
]);

/**
 * Total portfolio value in USD and NGN.
 *
 * The previous home screen summed raw balances across every chain and labelled
 * the result "USD", which is wrong as soon as more than one asset is held —
 * 0.4 BTC + 2 ETH was reported as "$2.4". With ERC-20 balances added it gets
 * worse. This prices each holding properly and reports `null` rather than a
 * made-up number when a price is unavailable.
 */
export function usePortfolioValue(): PortfolioValue {
  const balances = useWalletStore((s) => s.balances);
  const [prices, setPrices] = useState<Partial<Record<PriceSymbol, number>>>({});
  const [ngnRate, setNgnRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only the symbols actually held, so a wallet with one asset makes one cheap
  // request instead of pricing all nine on every refresh.
  const symbols = useMemo(() => {
    const unique = new Set<PriceSymbol>();
    for (const entry of balances) {
      if (KNOWN_PRICE_SYMBOLS.has(entry.symbol)) unique.add(entry.symbol as PriceSymbol);
    }
    return [...unique];
  }, [balances]);

  useEffect(() => {
    if (symbols.length === 0) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.all([getUsdPrices(symbols), usdToNgn(1)])
      .then(([usd, rate]) => {
        if (cancelled || !mounted.current) return;
        setPrices(usd);
        // `usdToNgn` already answers null for an unreadable rate. The `> 0`
        // guard is kept because a rate of exactly 0 is not a usable rate either,
        // but null now arrives as null rather than being papered over downstream.
        setNgnRate(rate !== null && rate > 0 ? rate : null);
        setError(null);
      })
      .catch(() => {
        if (cancelled || !mounted.current) return;
        setError('Live prices are unavailable, so your total value may be out of date.');
      })
      .finally(() => {
        if (!cancelled && mounted.current) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const { usd, priced } = useMemo(() => {
    let total = 0;
    let missing = 0;
    for (const entry of balances) {
      const amount = Number(entry.balance);
      if (!Number.isFinite(amount)) continue;
      if (!KNOWN_PRICE_SYMBOLS.has(entry.symbol)) {
        missing += 1;
        continue;
      }
      const price = prices[entry.symbol as PriceSymbol];
      if (price === undefined) {
        missing += 1;
        continue;
      }
      total += amount * price;
    }
    return { usd: missing > 0 && total === 0 ? null : total, priced: missing === 0 };
  }, [balances, prices]);

  return {
    usd,
    // A missing asset price makes the total a lower bound, not the truth, so
    // only show NGN when every holding was priced.
    ngn: usd !== null && priced && ngnRate !== null ? usd * ngnRate : null,
    isLoading,
    error,
  };
}

/** Per-asset USD value, for a balances row. `null` when unpriced. */
export function usdValueOf(entry: AssetBalance, prices: Partial<Record<PriceSymbol, number>>): number | null {
  const price = prices[entry.symbol as PriceSymbol];
  if (price === undefined) return null;
  const amount = Number(entry.balance);
  if (!Number.isFinite(amount)) return null;
  return amount * price;
}
