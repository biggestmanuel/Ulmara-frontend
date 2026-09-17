export type ChainId = 'ton' | 'bsc' | 'eth' | 'sol' | 'base' | 'polygon' | 'tron' | 'btc';

export interface ChainConfig {
  id: ChainId;
  name: string;
  symbol: string;
  isEvm: boolean;
  decimals: number;
  iconUrl?: string;
}
