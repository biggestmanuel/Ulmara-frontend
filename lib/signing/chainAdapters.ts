import type { ChainId } from '../chains';
import { signEvmNativeTransfer } from './evm';

export type SigningAvailability = 'available' | 'unavailable';

export interface SignTransferInput {
  asset: string;
  to: string;
  amount: string;
  transactionId?: string;
}

export interface ChainSigningAdapter {
  chain: ChainId;
  availability: SigningAvailability;
  unavailableReason?: string;
  signTransfer(input: SignTransferInput): Promise<string>;
}

const unavailable = (chain: ChainId, reason: string): ChainSigningAdapter => ({
  chain,
  availability: 'unavailable',
  unavailableReason: reason,
  signTransfer: async () => { throw new Error(`${chain}: ${reason}`); },
});

export const signingAdapters: Record<ChainId, ChainSigningAdapter> = {
  eth: {
    chain: 'eth',
    availability: 'available',
    signTransfer: (input) => signEvmNativeTransfer({ network: 'ETH', asset: input.asset, to: input.to, amount: input.amount }),
  },
  bsc: unavailable('bsc', 'BSC signing provider is not configured'),
  base: unavailable('base', 'Base signing provider is not configured'),
  polygon: unavailable('polygon', 'Polygon signing provider is not configured'),
  sol: unavailable('sol', 'Solana transaction builder and signer are not configured'),
  ton: unavailable('ton', 'TON transaction builder and signer are not configured'),
  tron: unavailable('tron', 'TRON transaction builder and signer are not configured'),
  btc: unavailable('btc', 'Bitcoin UTXO selection and signer are not configured'),
};

export function getSigningAdapter(chain: ChainId): ChainSigningAdapter {
  return signingAdapters[chain];
}
