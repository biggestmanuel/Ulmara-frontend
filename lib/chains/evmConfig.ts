import type { ChainId } from './index';
import { ethers } from 'ethers';

/**
 * Single source of truth for EVM chain IDs and RPC endpoints.
 *
 * ## Why this is centralised
 *
 * The RPC URL and the chain ID must agree with each other *and* with the
 * backend. Three separate problems came out of them being scattered:
 *
 *  1. `lib/signing/evm.ts` hardcoded `chainId: 11155111` (Sepolia) but read its
 *     RPC from `EXPO_PUBLIC_SEPOLIA_RPC_URL ?? EXPO_PUBLIC_ETH_RPC_URL` — neither
 *     of which is set in `.env`. It fell through to a hardcoded
 *     `https://rpc.sepolia.org` fallback, **which returns 404 HTML**, so every
 *     EVM signing attempt failed. There was no warning; it just never worked.
 *
 *  2. `.env` set `EXPO_PUBLIC_RPC_ETH` to an Ethereum **mainnet** endpoint
 *     (`0x1`) while the backend runs `ETHEREUM_CHAIN_ID=11155111` (Sepolia).
 *     Signing against mainnet RPC with a Sepolia chainId produces a
 *     transaction the network rejects.
 *
 *  3. A chain ID derived from the URL is impossible, so the two must be
 *     configured together and validated against each other.
 *
 * `assertChainIdMatchesRpc` turns that class of mismatch into one clear error
 * at the point of use instead of an inscrutable revert.
 */

/** Public fallbacks. Chosen because they are reachable and serve the chain id
 *  they claim; still overridable per environment. */
const DEFAULT_RPC: Record<ChainId, string | undefined> = {
  eth: 'https://ethereum-sepolia-rpc.publicnode.com',
  bsc: 'https://bsc-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
  polygon: 'https://polygon-bor-rpc.publicnode.com',
  sol: process.env.EXPO_PUBLIC_RPC_SOL,
  ton: process.env.EXPO_PUBLIC_RPC_TON,
  tron: process.env.EXPO_PUBLIC_RPC_TRON,
  btc: undefined,
};

const MAINNET_CHAIN_ID: Partial<Record<ChainId, number>> = {
  eth: 1,
  bsc: 56,
  base: 8453,
  polygon: 137,
};

// The backend pins Ethereum to Sepolia for the pilot phase and reads the value
// from ETHEREUM_CHAIN_ID. The client mirrors that default so the two agree out
// of the box, and EXPO_PUBLIC_ETHEREUM_CHAIN_ID overrides it at go-live.
const DEFAULT_ETHEREUM_CHAIN_ID = 11155111;

function num(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** EVM chains this build can talk to at all. */
export const EVM_CHAIN_IDS: ChainId[] = ['eth', 'bsc', 'base', 'polygon'];

/**
 * RPC URL for an EVM chain, or `undefined` when none is configured.
 *
 * `EXPO_PUBLIC_SEPOLIA_RPC_URL` is checked *before* `EXPO_PUBLIC_RPC_ETH` on
 * purpose. `RPC_ETH` in the pilot `.env` is a mainnet endpoint, and a
 * mainnet node behind a Sepolia chain id silently produces transactions the
 * network rejects. Ordering the explicitly-named testnet variable first means
 * setting it is sufficient and unambiguous.
 */
export function getEvmRpcUrl(chain: ChainId): string | undefined {
  const explicit = process.env.EXPO_PUBLIC_RPC_URLS;
  if (explicit) {
    try {
      const map = JSON.parse(explicit) as Record<string, string>;
      const value = map[chain.toUpperCase()] ?? map[chain];
      if (value) return value;
    } catch {
      console.warn('EXPO_PUBLIC_RPC_URLS is not valid JSON; falling back to per-chain env vars.');
    }
  }
  switch (chain) {
    case 'eth':
      return (
        process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL ??
        process.env.EXPO_PUBLIC_ETH_RPC_URL ??
        process.env.EXPO_PUBLIC_RPC_ETH ??
        DEFAULT_RPC.eth
      );
    case 'bsc':
      return process.env.EXPO_PUBLIC_BSC_RPC_URL ?? process.env.EXPO_PUBLIC_RPC_BSC ?? DEFAULT_RPC.bsc;
    case 'base':
      return process.env.EXPO_PUBLIC_BASE_RPC_URL ?? process.env.EXPO_PUBLIC_RPC_BASE ?? DEFAULT_RPC.base;
    case 'polygon':
      return (
        process.env.EXPO_PUBLIC_POLYGON_RPC_URL ??
        process.env.EXPO_PUBLIC_RPC_POLYGON ??
        DEFAULT_RPC.polygon
      );
    default:
      return DEFAULT_RPC[chain];
  }
}

/**
 * Chain ID for an EVM chain. Mirrors the backend's `*_CHAIN_ID` env vars so the
 * signed transaction and the server-side signature verification agree.
 */
export function getEvmChainId(chain: ChainId): number {
  switch (chain) {
    case 'eth':
      return num(process.env.EXPO_PUBLIC_ETHEREUM_CHAIN_ID) ?? DEFAULT_ETHEREUM_CHAIN_ID;
    case 'bsc':
      return num(process.env.EXPO_PUBLIC_BSC_CHAIN_ID) ?? MAINNET_CHAIN_ID.bsc!;
    case 'base':
      return num(process.env.EXPO_PUBLIC_BASE_CHAIN_ID) ?? MAINNET_CHAIN_ID.base!;
    case 'polygon':
      return num(process.env.EXPO_PUBLIC_POLYGON_CHAIN_ID) ?? MAINNET_CHAIN_ID.polygon!;
    default:
      throw new Error(`${chain} is not an EVM chain`);
  }
}

export function isEvmChain(chain: ChainId): boolean {
  return EVM_CHAIN_IDS.includes(chain);
}

const providerCache = new Map<ChainId, ethers.JsonRpcProvider>();

/**
 * Shared, static-network provider for an EVM chain.
 *
 * `staticNetwork: true` matters: with auto-detection, ethers will happily sign
 * for whichever chain the node reports, so pointing a Sepolia chain id at a
 * mainnet endpoint produces a transaction the network rejects with an opaque
 * error — long after the user has entered their PIN. Caching also keeps the
 * HTTP agent (and its connection) alive across balance reads and sends.
 */
export function getEvmProvider(chain: ChainId): ethers.JsonRpcProvider {
  const cached = providerCache.get(chain);
  if (cached) return cached;
  const url = getEvmRpcUrl(chain);
  if (!url) throw new Error(`No RPC URL is configured for ${chain.toUpperCase()}`);
  const provider = new ethers.JsonRpcProvider(url, getEvmChainId(chain), {
    staticNetwork: true,
    batchMaxCount: 1,
  });
  providerCache.set(chain, provider);
  return provider;
}

/**
 * Verifies the configured RPC actually serves the configured chain ID.
 *
 * Turns "the node and the config disagree" into one clear message at the point
 * of use, instead of a confusing revert deep inside a signing attempt.
 */
export async function assertChainIdMatchesRpc(chain: ChainId): Promise<void> {
  const expected = getEvmChainId(chain);
  const actualHex = await getEvmProvider(chain).send('eth_chainId', []);
  const actual = Number(BigInt(actualHex));
  if (actual !== expected) {
    throw new Error(
      `The ${chain.toUpperCase()} RPC reports chain ${actual} but this build is configured for chain ` +
        `${expected}. Update EXPO_PUBLIC_ETHEREUM_CHAIN_ID and the matching RPC URL so they agree with the backend.`
    );
  }
}

/** Native gas symbol for a chain — the coin that actually pays for gas. */
export function nativeSymbolForChain(chain: ChainId): string {
  switch (chain) {
    case 'eth':
    case 'base':
      return 'ETH';
    case 'bsc':
      return 'BNB';
    case 'polygon':
      return 'POL';
    default:
      return chain.toUpperCase();
  }
}

/** Human name for the network selector / receipt. */
export function getEvmNetworkName(chain: ChainId): string {
  switch (chain) {
    case 'eth':
      return getEvmChainId('eth') === 1 ? 'Ethereum' : 'Ethereum Sepolia';
    case 'bsc':
      return 'BNB Smart Chain';
    case 'base':
      return 'Base';
    case 'polygon':
      return 'Polygon';
    default:
      return chain.toUpperCase();
  }
}
