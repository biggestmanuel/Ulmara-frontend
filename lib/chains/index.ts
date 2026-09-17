export type ChainId = 'eth' | 'bsc' | 'base' | 'polygon' | 'sol' | 'tron' | 'ton' | 'btc';

export interface ChainAdapter {
  getBalance: (address: string) => Promise<string>;
  isValidAddress?: (address: string) => boolean;
  estimateFee?: () => Promise<string>;
}

const loaders: Record<ChainId, () => Promise<ChainAdapter>> = {
  eth: () => import('./eth'),
  bsc: () => import('./bsc'),
  base: () => import('./base'),
  polygon: () => import('./polygon'),
  sol: () => import('./sol'),
  tron: () => import('./tron'),
  ton: () => import('./ton'),
  // Bitcoin balances and transactions are resolved by the backend; there is
  // intentionally no client-side Bitcoin signer in this V1 build.
  btc: () => import('./btc'),
};

const cache: Partial<Record<ChainId, ChainAdapter>> = {};

export async function getChainModule(chain: ChainId): Promise<ChainAdapter> {
  if (cache[chain]) return cache[chain]!;
  const loader = loaders[chain];
  if (!loader) throw new Error(`Unknown chain: ${chain}`);
  const mod = await loader();
  cache[chain] = mod;
  return mod;
}

export function isChainLoaded(chain: ChainId): boolean {
  return chain in cache;
}