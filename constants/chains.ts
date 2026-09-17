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
  polygon: { id: 'polygon', name: 'Polygon', symbol: 'MATIC', isEvm: true, decimals: 18 },
  tron: { id: 'tron', name: 'Tron', symbol: 'TRX', isEvm: false, decimals: 6 },
  btc: { id: 'btc', name: 'Bitcoin', symbol: 'BTC', isEvm: false, decimals: 8 },
};

export const CHAIN_LIST: ChainConfig[] = Object.values(CHAINS);

export const EVM_CHAINS: ChainId[] = CHAIN_LIST.filter((c) => c.isEvm).map((c) => c.id);

export const NATIVE_ASSET_SYMBOLS = ['ETH', 'BNB', 'MATIC', 'SOL', 'TRX', 'TON', 'BTC'] as const;
export type NativeAssetSymbol = (typeof NATIVE_ASSET_SYMBOLS)[number];

export const DEFAULT_CHAIN: ChainId = 'eth';
