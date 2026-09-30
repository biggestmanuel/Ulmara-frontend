import { ethers } from 'ethers';

import type { ChainId } from '../chains';
import { getEvmProvider, isEvmChain } from '../chains/evmConfig';
import { canSignEvm, signEvmNativeTransfer, signEvmTokenTransfer } from './evm';
import { isTokenSymbol } from '../../constants/tokens';

export type SigningAvailability = 'available' | 'unavailable';

export interface SignTransferInput {
  asset: string;
  to: string;
  amount: string;
  transactionId?: string;
}

export interface ChainSigningAdapter {
  chain: ChainId;
  /** UPPERCASE wire identifier, e.g. "ETH". */
  network: string;
  availability: SigningAvailability;
  unavailableReason?: string;
  signTransfer(input: SignTransferInput): Promise<string>;
}

const unavailable = (chain: ChainId, reason: string): ChainSigningAdapter => ({
  chain,
  network: chain.toUpperCase(),
  availability: 'unavailable',
  unavailableReason: reason,
  signTransfer: async () => {
    throw new Error(`${chain}: ${reason}`);
  },
});

function evm(chain: ChainId, network: string): ChainSigningAdapter {
  return {
    chain,
    network,
    availability: 'available',
    signTransfer: (input) =>
      isTokenSymbol(input.asset)
        ? signEvmTokenTransfer({
            network,
            asset: input.asset,
            to: input.to,
            amount: input.amount,
            transactionId: input.transactionId,
          })
        : signEvmNativeTransfer({ network, asset: input.asset, to: input.to, amount: input.amount }),
  };
}

/**
 * Client-side signing registry.
 *
 * Every EVM chain shares one secp256k1 mnemonic, so ETH, BSC, Base and Polygon
 * are all signable. The previous build marked BSC, Base and Polygon
 * "not configured" purely because only the ETH network had been wired up.
 * The non-EVM chains still have no client-side transaction builder — a real
 * gap, left `unavailable` rather than faked.
 */
export const signingAdapters: Record<ChainId, ChainSigningAdapter> = {
  eth: evm('eth', 'ETH'),
  bsc: evm('bsc', 'BSC'),
  base: evm('base', 'BASE'),
  polygon: evm('polygon', 'POLYGON'),
  sol: unavailable('sol', 'Solana transaction builder and signer are not configured'),
  ton: unavailable('ton', 'TON transaction builder and signer are not configured'),
  tron: unavailable('tron', 'TRON transaction builder and signer are not configured'),
  btc: unavailable('btc', 'Bitcoin UTXO selection and signer are not configured'),
};

export function getSigningAdapter(chain: ChainId): ChainSigningAdapter {
  return signingAdapters[chain];
}

/** Adapter lookup by UPPERCASE wire identifier, as received from the API. */
export function getSigningAdapterByWire(wire: string): ChainSigningAdapter | null {
  return signingAdapters[wire.toLowerCase() as ChainId] ?? null;
}

export function isSignable(wire: string): boolean {
  return getSigningAdapterByWire(wire)?.availability === 'available';
}

export { canSignEvm };

export interface NativeFeeEstimate {
  fee: string;
  symbol: string;
  /** True when the figure is a conservative default, not a live estimateGas. */
  approximate: boolean;
}

/**
 * Live gas estimate for a **native** transfer, denominated in the chain's own
 * coin. The fee the user approves comes from the node rather than a guess.
 */
export async function estimateNativeTransferFee(input: {
  network: string;
  from: string;
  to: string;
}): Promise<NativeFeeEstimate> {
  const adapter = getSigningAdapterByWire(input.network);
  if (!adapter || adapter.availability !== 'available' || !isEvmChain(adapter.chain)) {
    throw new Error(`Fee estimation is not available on ${input.network}`);
  }
  const provider = getEvmProvider(adapter.chain);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!gasPrice) throw new Error('Could not read the current gas price');

  let gasLimit = 21_000n;
  let approximate = true;
  try {
    const estimate = await provider.estimateGas({ from: input.from, to: input.to });
    // 20% headroom for state growth between estimation and inclusion.
    gasLimit = (estimate * 120n) / 100n;
    approximate = false;
  } catch {
    // A plain native transfer is 21k; keep that as the floor.
  }

  return {
    fee: ethers.formatUnits(gasPrice * gasLimit, 18),
    symbol: nativeSymbolFor(adapter.chain),
    approximate,
  };
}

function nativeSymbolFor(chain: ChainId): string {
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
