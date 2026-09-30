import { create } from 'zustand';
import { getChainModule, type ChainId } from '../lib/chains';
import { getSecureItem, SecureStorageKeys } from '../lib/storage/secureStorage';
import { fetchWalletAddresses, fetchWalletBalances, toFrontendChainId } from '../lib/api/wallet';
import { fetchTokenBalances, getTokensForChain, type TokenBalance } from '../lib/api/tokens';
import { isEvmChain } from '../lib/chains/evmConfig';
import { isTokenSymbol } from '../constants/tokens';

const NATIVE_SYMBOLS: Record<ChainId, string> = {
  eth: 'ETH',
  bsc: 'BNB',
  base: 'ETH',
  polygon: 'POL',
  sol: 'SOL',
  tron: 'TRX',
  ton: 'TON',
  btc: 'BTC',
};

export interface AssetBalance {
  /** `${chainId}:${symbol}` — unique per chain+asset. */
  id: string;
  chainId: ChainId;
  symbol: string;
  balance: string;
  address: string;
  /** True for ERC-20 tokens, whose gas is paid in the chain's native coin. */
  isToken: boolean;
  decimals: number;
}

interface WalletState {
  addresses: Partial<Record<ChainId, string>>;
  balances: AssetBalance[];
  isLoadingBalances: boolean;
  isHydrated: boolean;
  /** Non-fatal problems from the last refresh (e.g. misconfigured tokens). */
  warning: string | null;

  hydrate: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  setAddress: (chainId: ChainId, address: string) => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  addresses: {},
  balances: [],
  isLoadingBalances: false,
  isHydrated: false,
  warning: null,

  hydrate: async () => {
    // Wallet addresses come from the backend (public addresses registered at
    // signup). We only hydrate them when an account is set up locally.
    const cachedAddresses = await getSecureItem(SecureStorageKeys.ACCOUNT_ID);
    set({ isHydrated: true });
    if (!cachedAddresses) return;
    try {
      const serverAddresses = await fetchWalletAddresses();
      const addresses = serverAddresses.reduce<Partial<Record<ChainId, string>>>((result, wallet) => {
        const chainId = toFrontendChainId(wallet.chain);
        if (chainId) result[chainId] = wallet.address;
        return result;
      }, {});
      set({ addresses });
    } catch (err) {
      console.error('Failed to hydrate wallet addresses:', err);
    }
    await get().refreshBalances();
  },

  setAddress: (chainId, address) => {
    set((state) => ({ addresses: { ...state.addresses, [chainId]: address } }));
  },

  /**
   * Loads native balances from the backend, then adds ERC-20 balances for every
   * EVM chain that has a wallet and at least one configured token.
   *
   * The two halves are independent: a failing token read (an RPC that is down,
   * a token contract that is not deployed on the configured network) must not
   * hide native balances, so failures are collected into `warning` rather than
   * thrown.
   */
  refreshBalances: async () => {
    const { addresses } = get();
    const chainIds = Object.keys(addresses) as ChainId[];
    if (chainIds.length === 0) return;

    set({ isLoadingBalances: true, warning: null });
    try {
      const serverBalances = await fetchWalletBalances();
      const native: AssetBalance[] = serverBalances.flatMap((entry) => {
        const chainId = toFrontendChainId(entry.chain);
        if (!chainId || entry.balance === null) return [];
        return [
          {
            id: `${chainId}:native`,
            chainId,
            symbol: NATIVE_SYMBOLS[chainId],
            balance: entry.balance,
            address: entry.address,
            isToken: false,
            decimals: 18,
          },
        ];
      });

      let assets: AssetBalance[] = native;
      if (native.length === 0) {
        // Backend balances unavailable; fall back to direct reads per chain.
        const results = await Promise.allSettled(
          chainIds.map(async (chainId): Promise<AssetBalance> => {
            const address = addresses[chainId]!;
            const adapter = await getChainModule(chainId);
            const balance = await adapter.getBalance(address);
            return {
              id: `${chainId}:native`,
              chainId,
              symbol: NATIVE_SYMBOLS[chainId],
              balance,
              address,
              isToken: false,
              decimals: 18,
            };
          })
        );
        assets = results
          .filter((result): result is PromiseFulfilledResult<AssetBalance> => result.status === 'fulfilled')
          .map((result) => result.value);
      }

      // --- ERC-20 balances -----------------------------------------------------
      const warnings: string[] = [];
      const tokenResults = await Promise.allSettled(
        chainIds
          .filter((chainId) => isEvmChain(chainId) && addresses[chainId])
          .map(async (chainId): Promise<TokenBalance[]> => {
            // Hydrate the registry from the backend first, so the contract
            // addresses read below are the ones the backend says exist on this
            // network (Sepolia USDC, not a mainnet address that names nothing).
            const tokens = await getTokensForChain(chainId);
            const result = await fetchTokenBalances({
              chain: chainId,
              address: addresses[chainId]!,
              tokens,
            });
            if (result.warning) warnings.push(result.warning);
            return result.balances;
          })
      );
      for (const result of tokenResults) {
        if (result.status === 'rejected') {
          warnings.push('Some token balances could not be read from the network.');
        }
      }

      const tokenRows: TokenBalance[] = [];
      for (const result of tokenResults) {
        if (result.status === 'fulfilled') tokenRows.push(...result.value);
      }

      const tokens: AssetBalance[] = tokenRows.flatMap((token) => {
        if (!isTokenSymbol(token.symbol)) return [];
        return [
          {
            id: `${token.chain}:${token.symbol}`,
            chainId: token.chain,
            symbol: token.symbol,
            balance: token.balance,
            address: addresses[token.chain] ?? '',
            isToken: true,
            decimals: token.decimals,
          },
        ];
      });

      // De-duplicate: the native list can contain one entry per chain, and a
      // token list entry always has a distinct id, but a second refresh that
      // partially fails must not leave two rows for the same asset.
      const merged = new Map<string, AssetBalance>();
      for (const entry of [...assets, ...tokens]) merged.set(entry.id, entry);

      set({ balances: [...merged.values()], warning: warnings[0] ?? null });
    } catch (err) {
      console.error('Failed to refresh balances:', err);
      set({ warning: 'We could not refresh your balances. Pull down to try again.' });
    } finally {
      set({ isLoadingBalances: false });
    }
  },
}));
