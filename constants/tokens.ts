import type { ChainId } from '../lib/chains';
import { getEvmChainId } from '../lib/chains/evmConfig';

/**
 * ERC-20 token registry.
 *
 * ## Why addresses are configuration, not hardcoded constants
 *
 * A token contract only exists on a network if it was deployed there. The
 * backend currently runs Ethereum against Sepolia (`ETHEREUM_CHAIN_ID=11155111`),
 * where there is no canonical USDT or USDC deployment — a mainnet address there
 * would silently point at nothing and every "token transfer" would revert.
 *
 * So every network entry is resolved from configuration, and a token with no
 * address for the selected network is **hidden from the UI entirely**. The app
 * can therefore never offer a token transfer it is unable to execute.
 *
 * Two sources, lowest precedence first:
 *
 * 1. `SEEDED_ADDRESSES` — canonical **mainnet** deployments, so the app is
 *    useful the moment `ETHEREUM_CHAIN_ID` flips to 1. Each entry is annotated
 *    with the chain it is valid on. None of them are valid on a testnet.
 *
 * 2. `EXPO_PUBLIC_TOKEN_ADDRESSES` — a JSON object keyed `"<SYMBOL>:<CHAIN>"`
 *    that overrides (or adds to) the seeds. Chain keys are the UPPERCASE wire
 *    identifiers the backend uses ("ETH", "BSC", "BASE", "POLYGON"):
 *    ```json
 *    { "USDC:ETH": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" }
 *    ```
 *
 * See README "ERC-20 token support" for the full setup instructions.
 */
export interface TokenDefinition {
  /** Wire symbol. Stored verbatim as `Transaction.asset` on the backend. */
  symbol: string;
  name: string;
  /** 6 for both stablecoins. Drives amount parsing and formatting. */
  decimals: number;
  /** Chains this token may ever be used on. */
  chains: ChainId[];
  addresses: Partial<Record<ChainId, string>>;
}

const MAINNET_ETHEREUM: ChainId = 'eth';
const BSC: ChainId = 'bsc';
const POLYGON: ChainId = 'polygon';
const BASE: ChainId = 'base';

export const TOKEN_DEFINITIONS: TokenDefinition[] = [
  {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    chains: [MAINNET_ETHEREUM, BSC, POLYGON, BASE],
    addresses: {
      // Tether USD, Ethereum mainnet (chainId 1).
      [MAINNET_ETHEREUM]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      // Tether USD, BNB Smart Chain (chainId 56).
      [BSC]: '0x55d398326f99059fF775485246999027B3197955',
      // Tether USD, Polygon PoS (chainId 137).
      [POLYGON]: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      // No canonical USDT deployment on Base; supply EXPO_PUBLIC_TOKEN_ADDRESSES
      // if one is used.
    },
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    chains: [MAINNET_ETHEREUM, BSC, POLYGON, BASE],
    addresses: {
      // Circle USDC, Ethereum mainnet (chainId 1).
      [MAINNET_ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      // Circle USDC, BNB Smart Chain (chainId 56).
      [BSC]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      // Circle native USDC, Polygon PoS (chainId 137).
      [POLYGON]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      // Circle native USDC, Base (chainId 8453).
      [BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  },
];

export const SUPPORTED_TOKEN_SYMBOLS: string[] = TOKEN_DEFINITIONS.map((t) => t.symbol);
export type TokenSymbol = (typeof TOKEN_DEFINITIONS)[number]['symbol'];

/**
 * `EXPO_PUBLIC_TOKEN_ADDRESSES` overrides the seeded addresses.
 *
 * Parsed once at module load. A malformed value is ignored (and logged) rather
 * than thrown at import time — a bad env var must not stop the app booting for
 * the far more common native-only path.
 */
function parseAddressOverrides(): Record<string, string> {
  const raw = process.env.EXPO_PUBLIC_TOKEN_ADDRESSES;
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('EXPO_PUBLIC_TOKEN_ADDRESSES is not valid JSON; using seeded addresses only:', err);
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
      console.warn(`Ignoring EXPO_PUBLIC_TOKEN_ADDRESSES["${key}"]: not a 20-byte hex address`);
      continue;
    }
    out[key.toUpperCase()] = value;
  }
  return out;
}

const ADDRESS_OVERRIDES = parseAddressOverrides();

/**
 * The chain id each seeded address belongs to.
 *
 * A seeded address is only usable when the app is actually pointed at that
 * network. The backend runs Sepolia (`EXPO_PUBLIC_ETHEREUM_CHAIN_ID=11155111`),
 * and a mainnet token address on Sepolia names a contract that does not exist
 * there — the transfer would revert, or worse, hit whatever is at that address
 * on the testnet. So a seed is dropped unless the configured chain id matches.
 *
 * `EXPO_PUBLIC_TOKEN_ADDRESSES` overrides are NOT subject to this: supplying an
 * address is explicit operator intent for whatever network is configured.
 */
const SEEDED_CHAIN_IDS: Partial<Record<ChainId, number>> = {
  [MAINNET_ETHEREUM]: 1,
  [BSC]: 56,
  [POLYGON]: 137,
  [BASE]: 8453,
};

function isSeedUsable(chain: ChainId): boolean {
  const expected = SEEDED_CHAIN_IDS[chain];
  if (expected === undefined) return false;
  return getEvmChainId(chain) === expected;
}

/**
 * Registry hydrated from the backend.
 *
 * `GET /api/wallet/tokens/:chain` is authoritative about which ERC-20 contracts
 * exist on a network, at which address, with how many decimals. For the pilot
 * network (Ethereum **Sepolia**) it returns Circle's Sepolia USDC — an address
 * that cannot be hardcoded here, because the local seeds are mainnet-only and a
 * mainnet address on Sepolia names nothing.
 *
 * This cache is what makes that work without touching every call site. The
 * encoding and signing paths (`lib/tokens/erc20.ts`, `lib/signing/evm.ts`) must
 * resolve a contract address **synchronously** — they build calldata — so they
 * cannot `await` a fetch. Hydrating the registry once per session means those
 * paths read the backend's verified address through the same
 * `getTokenForChain` they already called.
 *
 * Local configuration is still consulted on every lookup, so:
 *   - `EXPO_PUBLIC_TOKEN_ADDRESSES` always wins (deliberate operator intent);
 *   - a backend that has no registry route degrades to the local seeds, which
 *     the `isSeedUsable` guard already restricted to the right network.
 */
const hydratedRegistry = new Map<ChainId, Map<string, TokenDefinition>>();

/**
 * Records a backend-supplied token for a chain.
 *
 * Called by `lib/api/tokens.ts` once the registry has been fetched. Only
 * well-formed entries are accepted, and an operator-pinned address still takes
 * precedence, so a malformed or stale backend response cannot corrupt the
 * addresses used to build calldata.
 */
export function hydrateTokenRegistry(chain: ChainId, entries: TokenRegistrySeed[]): void {
  let bucket = hydratedRegistry.get(chain);
  if (!bucket) {
    bucket = new Map();
    hydratedRegistry.set(chain, bucket);
  }
  for (const entry of entries) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(entry.address)) continue;
    if (!Number.isInteger(entry.decimals) || entry.decimals < 0 || entry.decimals > 36) continue;
    const symbol = entry.symbol.toUpperCase();
    // An explicitly configured address is never overwritten by a fetch.
    const pinned = ADDRESS_OVERRIDES[`${symbol}:${chain.toUpperCase()}`];
    bucket.set(symbol, {
      symbol,
      name: entry.name || symbol,
      decimals: entry.decimals,
      chains: [chain],
      addresses: { [chain]: pinned ?? entry.address },
    });
  }
}

/** Clears hydrated entries. Used on logout and by tests. */
export function resetTokenRegistry(): void {
  hydratedRegistry.clear();
}

/** True when the backend has told us about this chain. */
export function isTokenRegistryHydrated(chain: ChainId): boolean {
  return hydratedRegistry.has(chain);
}

export interface TokenRegistrySeed {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
}

/** Effective address map for a symbol, with env overrides applied. */
export function getTokenAddresses(symbol: string): Partial<Record<ChainId, string>> {
  const definition = TOKEN_DEFINITIONS.find((t) => t.symbol === symbol);
  const resolved: Partial<Record<ChainId, string>> = {};

  if (definition) {
    // Seeds first, filtered to networks the app is actually pointed at.
    for (const [chain, address] of Object.entries(definition.addresses)) {
      const id = chain as ChainId;
      if (address && isSeedUsable(id)) resolved[id] = address;
    }
  }

  // Then anything the backend has told us exists on that network.
  for (const [chain, bucket] of hydratedRegistry) {
    const entry = bucket.get(symbol.toUpperCase());
    // Operator override beats the backend.
    const override = ADDRESS_OVERRIDES[`${symbol.toUpperCase()}:${chain.toUpperCase()}`];
    if (override) {
      resolved[chain] = override;
      continue;
    }
    // The backend says this symbol exists on this chain, but the local
    // definition may not list the chain at all. Previously the `!` here
    // asserted it did, and on that path the function returned a map containing
    // `chain: undefined` — a key that reads as present and carries no value.
    // Skipping the assignment is what the assertion was pretending was already
    // happening, and downstream lookups test truthiness anyway.
    const address = entry?.addresses[chain];
    if (address) resolved[chain] = address;
  }

  return resolved;
}

/** The token on that network, or `null` when it is not configured there. */
export function getTokenForChain(symbol: string, chain: ChainId): TokenDefinition | null {
  // Backend-supplied first: it knows the real address and decimals for this
  // network, and may list a symbol the local table has never heard of.
  const hydrated = hydratedRegistry.get(chain)?.get(symbol.toUpperCase());
  if (hydrated) return hydrated;

  const definition = TOKEN_DEFINITIONS.find((t) => t.symbol === symbol);
  if (!definition) return null;
  const address = getTokenAddresses(symbol)[chain];
  if (!address) return null;
  return { ...definition, addresses: { [chain]: address } };
}

export function isTokenSymbol(value: string): boolean {
  if (SUPPORTED_TOKEN_SYMBOLS.includes(value)) return true;
  for (const bucket of hydratedRegistry.values()) {
    if (bucket.has(value.toUpperCase())) return true;
  }
  return false;
}

/** Tokens with a real contract address on `chain`. Drives the asset picker. */
export function getConfiguredTokens(chain: ChainId): TokenDefinition[] {
  const out: TokenDefinition[] = [];
  const seen = new Set<string>();

  for (const token of TOKEN_DEFINITIONS) {
    const address = getTokenAddresses(token.symbol)[chain];
    if (address) {
      out.push({ ...token, addresses: { [chain]: address } });
      seen.add(token.symbol.toUpperCase());
    }
  }

  // Anything the backend listed that the local table does not have.
  for (const [symbol, entry] of hydratedRegistry.get(chain) ?? []) {
    if (seen.has(symbol)) continue;
    out.push(entry);
  }

  return out;
}
