export type ChainId = 'ton' | 'bsc' | 'eth' | 'sol' | 'base' | 'polygon' | 'tron' | 'btc';

export interface ChainConfig {
  id: ChainId;
  name: string;
  symbol: string;
  isEvm: boolean;
  decimals: number;
}

export const CHAINS: Record<ChainId, ChainConfig> = {
  ton: { id: 'ton', name: 'TON', symbol: 'TON', isEvm: false, decimals: 9 },
  bsc: { id: 'bsc', name: 'BNB Smart Chain', symbol: 'BNB', isEvm: true, decimals: 18 },
  eth: { id: 'eth', name: 'Ethereum', symbol: 'ETH', isEvm: true, decimals: 18 },
  sol: { id: 'sol', name: 'Solana', symbol: 'SOL', isEvm: false, decimals: 9 },
  base: { id: 'base', name: 'Base', symbol: 'ETH', isEvm: true, decimals: 18 },
  polygon: { id: 'polygon', name: 'Polygon', symbol: 'POL', isEvm: true, decimals: 18 },
  tron: { id: 'tron', name: 'Tron', symbol: 'TRX', isEvm: false, decimals: 6 },
  btc: { id: 'btc', name: 'Bitcoin', symbol: 'BTC', isEvm: false, decimals: 8 },
};

export const CHAIN_LIST: ChainConfig[] = Object.values(CHAINS);

/**
 * Human-readable name for a chain, with a sensible fallback.
 *
 * This is the ONE place a chain's display name lives. It reads `CHAINS[id].name`
 * rather than repeating the strings, because three private copies had already
 * drifted: `walletSetupErrors` and `addresses` disagreed on BSC ("BNB Smart
 * Chain" vs "BSC") and on TRON ("Tron" vs "TRON"). The same chain was named two
 * different ways on two screens the user could compare side by side.
 *
 * Accepts a `ChainId` or any string, because callers hold values that come off
 * the wire (`error.chain`, a route param) and narrowing those would mean casting
 * at each call site — which is how the copies multiplied in the first place.
 *
 * `CHAIN_LIST`/`CHAINS` above deliberately keep `bsc: 'BNB Smart Chain'` and
 * `tron: 'Tron'`. Those are the canonical display names in this codebase, and
 * the two screens that said "BSC"/"TRON" were the outliers, not the other way
 * round. Changing the canonical value instead would have renamed chains on every
 * screen that already agreed — a larger and less predictable change than making
 * the three read from one place.
 */
export function chainLabel(chain: string): string {
  const known = CHAINS[chain as ChainId];
  return known?.name ?? chain.toUpperCase();
}

export const EVM_CHAINS: ChainId[] = CHAIN_LIST.filter((c) => c.isEvm).map((c) => c.id);

export const NATIVE_ASSET_SYMBOLS = ['ETH', 'BNB', 'POL', 'SOL', 'TRX', 'TON', 'BTC'] as const;
export type NativeAssetSymbol = (typeof NATIVE_ASSET_SYMBOLS)[number];

export const DEFAULT_CHAIN: ChainId = 'eth';
