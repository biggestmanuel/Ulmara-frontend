import { useCallback, useEffect, useMemo } from 'react';

import { useWalletStore, type AssetBalance } from '../stores/walletStore';
import { usePortfolioValue } from './usePortfolioValue';
import type { ChainId } from '../lib/chains';

/**
 * Balance access for a screen.
 *
 * Rewritten against the store's actual shape. The previous version cast
 * `balances` (a flat `AssetBalance[]`) to a `Record<chain, …>[]`, indexed it
 * with a chain id, and summed a `usdValue` field that does not exist — so it
 * always returned `[]` and a total of `0`. Nothing imported it, which is why
 * the bug went unnoticed; it is fixed here so the next caller gets real data.
 */
export function useBalance(chain?: ChainId) {
  const allBalances = useWalletStore((s) => s.balances);
  const isRefreshing = useWalletStore((s) => s.isLoadingBalances);
  const warning = useWalletStore((s) => s.warning);
  const refreshBalances = useWalletStore((s) => s.refreshBalances);
  const { usd, ngn, isLoading: isPricing, error: priceError } = usePortfolioValue();

  const balances = useMemo<AssetBalance[]>(
    () => (chain ? allBalances.filter((entry) => entry.chainId === chain) : allBalances),
    [allBalances, chain]
  );

  const refresh = useCallback(() => {
    void refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    balances,
    /** Total across every holding, in USD. `null` when a price is missing. */
    totalUsdValue: usd,
    totalNgnValue: ngn,
    isRefreshing,
    isPricing,
    warning,
    priceError,
    refresh,
  };
}
