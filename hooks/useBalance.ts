import { useCallback, useEffect } from 'react';
import { useWalletStore } from '../stores/walletStore';
// Keep this hook independent from the project's path aliases.
type ChainId = string;

// Assumes walletStore exposes: balances (per-chain asset list),
// isRefreshing, refreshBalances(chain?: ChainId)

export function useBalance(chain?: ChainId) {
  const balances = useWalletStore((s) =>
    chain
      ? (s.balances as unknown as Record<string, { usdValue?: number }[]>)[
          chain
        ] ?? []
      : Object.values(
          s.balances as unknown as Record<string, { usdValue?: number }[]>
        ).flat()
  );
  const isRefreshing = useWalletStore(
    (s) => (s as unknown as { isRefreshing?: boolean }).isRefreshing ?? false
  );
  const refreshBalances = useWalletStore((s) => s.refreshBalances);

  const refresh = useCallback(() => refreshBalances(), [refreshBalances]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalUsdValue = balances.reduce(
    (sum, asset) => sum + (asset.usdValue ?? 0),
    0
  );

  return {
    balances,
    totalUsdValue,
    isRefreshing,
    refresh,
  };
}
