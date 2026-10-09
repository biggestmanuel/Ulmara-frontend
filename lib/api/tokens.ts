import { apiClient, toApiError } from './client';
import {
  getConfiguredTokens,
  hydrateTokenRegistry,
  resetTokenRegistry,
  type TokenDefinition,
} from '../../constants/tokens';
import type { ChainId } from '../chains';
import { readTokenBalance, isTokenContract } from '../tokens/erc20';

/**
 * # Token balances and the token registry
 *
 * ## The registry comes from the backend
 *
 * `GET /api/wallet/tokens/:chain` exists and is the authoritative source of
 * which ERC-20 contracts exist on a network, at what address, with how many
 * decimals. Its response for the pilot network is:
 *
 * ```json
 * { "success": true, "data": [
 *     { "symbol": "USDC", "name": "USD Coin", "decimals": 6,
 *       "address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" } ] }
 * ```
 *
 * That address is Circle's **Sepolia** USDC — which matters, because a token
 * address is network-specific. `constants/tokens.ts` only holds canonical
 * *mainnet* addresses, and the app runs against Sepolia, where those names
 * nothing. Fetching the registry is therefore the difference between the send
 * screen offering a working USDC transfer and offering nothing at all.
 *
 * ## Two things about that endpoint that are easy to get wrong
 *
 * 1. **The chain must be UPPERCASE.** `GET /api/wallet/tokens/ETH` returns the
 *    registry; `GET /api/wallet/tokens/eth` returns `400 "Unsupported chain: eth"`.
 *    This app uses lowercase `ChainId`s internally (`'eth'`, `'bsc'`, …) — that
 *    is the wire convention the backend documents and expects — so
 *    `toWireChain` is applied to every call.
 * 2. **A 400 here means "no tokens on this chain", not "bad request".** BSC,
 *    Base, Polygon, SOL, BTC and TON all 400, because the pilot backend is only
 *    configured for Ethereum Sepolia. That is a normal, expected answer and must
 *    not be reported as an error.
 *
 * ## Fallbacks
 *
 * If the route is missing (404/405) the client falls back to the local
 * configuration registry, and then to direct RPC for balances. The
 * `EXPO_PUBLIC_TOKEN_ADDRESSES` override still wins over everything, because
 * supplying an address is deliberate operator intent.
 */
const TOKEN_REGISTRY_PATH =
  process.env.EXPO_PUBLIC_TOKEN_REGISTRY_PATH ?? '/api/wallet/tokens';

const TOKEN_BALANCES_PATH =
  process.env.EXPO_PUBLIC_TOKEN_BALANCES_PATH ?? '/api/wallet/token-balances';

export interface TokenRegistryEntry {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
}

export interface TokenBalance {
  symbol: string;
  name: string;
  chain: ChainId;
  /** UPPERCASE wire identifier, matching the rest of the API surface. */
  network: string;
  decimals: number;
  contractAddress: string;
  balance: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/** `ChainId` -> the UPPERCASE wire identifier the API expects. */
export function toWireChain(chain: ChainId): string {
  return chain.toUpperCase();
}

/** Registry per chain, plus a per-session record of whether the route exists. */
const registryCache = new Map<ChainId, TokenRegistryEntry[]>();
let registrySupported: boolean | null = null;

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Fetches the authoritative ERC-20 registry for a chain and hydrates it into
 * `constants/tokens.ts`.
 *
 * Returns an empty list for a chain the backend has no tokens for, and for a
 * backend without the route — in both cases the caller falls back to local
 * configuration, and `source` says which happened so the UI can be honest about
 * where a token's address came from.
 */
export async function fetchTokenRegistry(
  chain: ChainId
): Promise<{ tokens: TokenRegistryEntry[]; source: 'backend' | 'config' }> {
  const cached = registryCache.get(chain);
  if (cached) return { tokens: cached, source: 'backend' };

  if (registrySupported !== false) {
    try {
      const { data } = await apiClient.get<ApiEnvelope<TokenRegistryEntry[]>>(
        `${TOKEN_REGISTRY_PATH}/${toWireChain(chain)}`
      );
      // Defensive: a malformed entry must not become a contract address the
      // app will try to call. `hydrateTokenRegistry` re-validates and drops
      // anything that fails, so a bad response cannot corrupt calldata.
      const tokens = (data.data ?? []).filter(
        (entry): entry is TokenRegistryEntry =>
          typeof entry?.symbol === 'string' &&
          typeof entry?.name === 'string' &&
          Number.isInteger(entry?.decimals) &&
          isHexAddress(entry?.address)
      );
      hydrateTokenRegistry(chain, tokens);
      registryCache.set(chain, tokens);
      registrySupported = true;
      return { tokens, source: 'backend' };
    } catch (err) {
      const status = toApiError(err).status;
      if (status === 404 || status === 405) {
        // The route itself is absent — stop probing it for the session.
        registrySupported = false;
      } else if (status === 400) {
        // "Unsupported chain" — a normal answer, not a failure. Cache the empty
        // result so we do not re-ask on every render of the asset picker.
        registryCache.set(chain, []);
        registrySupported = true;
        return { tokens: [], source: 'backend' };
      }
    }
  }

  return { tokens: [], source: 'config' };
}

/**
 * The tokens to offer on a chain.
 *
 * Fetches the backend registry first, then reads the effective list back out of
 * `constants/tokens.ts` so that local configuration and any
 * `EXPO_PUBLIC_TOKEN_ADDRESSES` override are applied in exactly one place — the
 * same place the signing paths read from.
 */
export async function getTokensForChain(chain: ChainId): Promise<TokenDefinition[]> {
  await fetchTokenRegistry(chain);
  return getConfiguredTokens(chain);
}

/* -------------------------------------------------------------------------- */
/* Balances                                                                    */
/* -------------------------------------------------------------------------- */

let balancesSupported: boolean | null = null;

/**
 * Token balances for one address on one EVM chain.
 *
 * `GET /api/wallet/token-balances` is the endpoint this client is designed to
 * use so RPC fan-out, rate limiting and caching stay server-side. The backend
 * does not implement it today, so balances are read with one `eth_call` per
 * token through `lib/tokens/erc20.ts`. That is a *read*, not duplicated
 * blockchain business logic: the ledger, the PIN gate, idempotency and broadcast
 * all stay on the backend.
 *
 * Tokens that are not configured for the chain are skipped, and a token whose
 * address holds no contract code on this network is skipped too — that is the
 * signature of a mainnet address pointed at a testnet, and failing loudly on
 * every refresh would be worse than omitting it.
 */
export async function fetchTokenBalances(input: {
  chain: ChainId;
  address: string;
  tokens: TokenDefinition[];
}): Promise<{ balances: TokenBalance[]; source: 'backend' | 'rpc'; warning: string | null }> {
  const configured = input.tokens;
  if (configured.length === 0) return { balances: [], source: 'rpc', warning: null };

  if (balancesSupported !== false) {
    try {
      const { data } = await apiClient.get<ApiEnvelope<TokenBalance[]>>(TOKEN_BALANCES_PATH, {
        params: { chain: toWireChain(input.chain), address: input.address },
      });
      balancesSupported = true;
      // Only an array is usable. `data.data ?? []` was not enough: the store
      // spreads this value (`tokenRows.push(...result.value)`), so an object or
      // a string in `data` threw a TypeError inside the fulfilment branch of
      // `Promise.allSettled` and took the entire refresh down with it - native
      // balances included, since they are merged afterwards. A malformed
      // optional payload is worth less than the balances already in hand, so
      // anything that is not an array is treated as no token data.
      return {
        balances: Array.isArray(data.data) ? data.data : [],
        source: 'backend',
        warning: null,
      };
    } catch (err) {
      const status = toApiError(err).status;
      if (status === 404 || status === 405) {
        // The route is absent. Remember it for the session so we stop probing,
        // and fall through to the RPC path.
        balancesSupported = false;
      }
      // Any other status, and a transport failure with no status at all, also
      // falls through. Token balances are an optional enrichment layered on top
      // of native balances, which are already loaded by the time this runs, and
      // the RPC path below answers the same question. Surfacing a warning here
      // put a red banner over a perfectly good balance list because an endpoint
      // the user never asked for returned 500. `balancesSupported` is left
      // alone, so a transient failure is retried on the next refresh.
    }
  }

  const balances: TokenBalance[] = [];
  let skipped = 0;
  const results = await Promise.allSettled(
    configured.map(async (token) => {
      const contractAddress = token.addresses[input.chain];
      if (!contractAddress) return null;
      const isContract = await isTokenContract(contractAddress, input.chain);
      if (!isContract) {
        skipped += 1;
        return null;
      }
      const balance = await readTokenBalance({
        symbol: token.symbol,
        chain: input.chain,
        owner: input.address,
      });
      return {
        symbol: token.symbol,
        name: token.name,
        chain: input.chain,
        network: toWireChain(input.chain),
        decimals: token.decimals,
        contractAddress,
        balance,
      } satisfies TokenBalance;
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) balances.push(result.value);
  }

  return {
    balances,
    source: 'rpc',
    warning:
      skipped > 0
        ? `${skipped} token${skipped === 1 ? '' : 's'} skipped: the configured contract address has no code on this network.`
        : null,
  };
}

/** Reset the per-session route probes and hydrated addresses. Used on logout. */
export function resetTokenBackendProbes(): void {
  registryCache.clear();
  registrySupported = null;
  balancesSupported = null;
  resetTokenRegistry();
}
