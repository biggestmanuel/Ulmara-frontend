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
    // Declared before the native read, not after. The unreadable-chain warning is
    // produced while building `native`, so it has to exist by then.
    const warnings: string[] = [];
    try {
      const serverBalances = await fetchWalletBalances();
      // A chain whose balance came back null is NOT a zero balance.
      //
      // The backend returns `balance: null` from exactly one place, and it is
      // deliberate (wallet.service.ts): the chain adapter threw, so it substitutes
      // a null row rather than failing the whole read. A real zero arrives as the
      // string "0.000…". So null means "a wallet exists here and I could not read
      // it" — and dropping the row, as this used to, made an unreadable chain
      // indistinguishable from one the account does not hold.
      const unreadable: string[] = [];
      const native: AssetBalance[] = serverBalances.flatMap((entry) => {
        const chainId = toFrontendChainId(entry.chain);
        // A chain we cannot map to a ChainId is a wiring problem, not a balance
        // problem, so it is counted as unreadable too rather than vanishing.
        if (!chainId) {
          unreadable.push(entry.chain);
          return [];
        }
        if (entry.balance === null) {
          unreadable.push(NATIVE_SYMBOLS[chainId] ?? chainId.toUpperCase());
          return [];
        }
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

      // Name the chains. "TON and BTC balances couldn't be read" is something the
      // user can act on; a generic string is indistinguishable from any other
      // partial failure. The warning is expected to appear for TON and BTC in
      // this environment — no reachable RPC for either — and that is the fix
      // working, not a regression.
      if (unreadable.length > 0) {
        warnings.push(
          unreadable.length === 1
            ? `${unreadable[0]} balance could not be read right now.`
            : `${unreadable.slice(0, -1).join(', ')} and ${unreadable[unreadable.length - 1]} balances could not be read right now.`
        );
      }

      let assets: AssetBalance[] = native;
      if (serverBalances.length === 0) {
        // The backend answered, and its answer was "no rows". That is a complete
        // answer — an account with no wallets, or none the backend recognises —
        // not an outage, so it is trusted and NOT re-read.
        //
        // The previous test was `native.length === 0`, which conflated three
        // different things: an empty answer, an answer whose every row was
        // unreadable, and a genuine failure. Only the third earns a fallback. In
        // practice the first two are what occur — a real account returns 8 rows
        // with 6 readable and 2 null — so that test fired for the wrong reason
        // and, where it did fire, hid the nulls it was supposed to report.
      } else if (native.length === 0) {
        // Every row was unreadable, so the direct reads are a genuine retry of a
        // read that failed rather than a re-read of a real answer.
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
      // `warnings` is declared above the native read, so the unreadable-native
      // entry is already in it by now.
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

      // `warning` is a single string, so joining is the only way to keep more than one
      // problem visible. Taking `warnings[0]` dropped the rest silently — with an
      // unreadable native chain AND an unreadable token, the user was told about
      // only one of them and had no way to learn the other existed. The
      // unreadable-native entry is pushed first, so it leads the sentence, which
      // is the more consequential of the two: it is a native holding, not an
      // optional token.
      set({
        balances: [...merged.values()],
        warning: warnings.length > 0 ? warnings.join(' ') : null,
      });
    } catch (err) {
      console.error('Failed to refresh balances:', err);
      set({ warning: 'We could not refresh your balances. Pull down to try again.' });
    } finally {
      set({ isLoadingBalances: false });
    }
  },
}));
