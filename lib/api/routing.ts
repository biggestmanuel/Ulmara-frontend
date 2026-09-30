import { ethers } from 'ethers';

import { getEvmProvider, getEvmNetworkName, isEvmChain, nativeSymbolForChain } from '../chains/evmConfig';
import type { ChainId } from '../chains';
import { getSigningAdapterByWire } from '../signing/chainAdapters';
import { getConfiguredTokens, isTokenSymbol } from '../../constants/tokens';
import { estimateTokenTransferGas } from '../tokens/erc20';
import { CHAINS } from '../../constants/chains';

/**
 * Route quotes for the send flow.
 *
 * ## Why these are computed on the client
 *
 * The previous implementation called `POST /api/routing/quotes`. **That route
 * does not exist** — `server/app.ts` mounts `/api/auth`, `/api/account`,
 * `/api/wallet`, `/api/transaction`, `/api/payment`, `/api/ramp`,
 * `/api/validation` and `/api/contact`, and nothing else. Every request 404'd,
 * `network-select` rendered "Live network quotes are unavailable", and because
 * that screen disables Continue without a quote, **the Ulmara-to-Ulmara transfer
 * flow could not be completed at all**.
 *
 * Everything a quote needs is already known on the client:
 *  - which chains the **recipient** can receive on, and their addresses
 *    (`wallets` from `GET /api/account/resolve/:accountId`),
 *  - which chains this build can **sign** for (`signingAdapters`),
 *  - which chains have the **token** configured (`getConfiguredTokens`),
 *  - the live **gas price** from that chain's public RPC.
 *
 * So quotes are computed from real chain data rather than stubbed. The shape is
 * kept behind `RouteQuote` so a future server-side quotes endpoint is a drop-in
 * replacement with no UI change. See README "Routing quotes".
 */
export interface RecipientWallet {
  chain: string;
  address: string;
}

export interface RouteQuote {
  /** UPPERCASE wire identifier, the same value confirm.tsx forwards onward. */
  network: string;
  label: string;
  /** Gas cost in the **native** coin, e.g. "0.0000421". Never in the token. */
  estimatedFee: string;
  estimatedSeconds: number;
  available: boolean;
  unavailableReason?: string;
  /** True when the asset is an ERC-20 rather than the chain's native coin. */
  isToken: boolean;
  tokenConfigured: boolean;
  /** Sender's native balance on this network, when it could be read. */
  nativeBalance?: string;
  nativeSymbol?: string;
  /** True when the native balance cannot cover the estimated fee. */
  insufficientGas?: boolean;
  /** True when the fee is a conservative default rather than a live estimate. */
  approximateFee?: boolean;
  /** Recipient's address on this network, carried through to the confirm screen. */
  recipientAddress?: string;
}

const WIRE_TO_CHAIN: Record<string, ChainId> = {
  ETH: 'eth',
  BSC: 'bsc',
  BASE: 'base',
  POLYGON: 'polygon',
  SOL: 'sol',
  TRON: 'tron',
  TON: 'ton',
  BTC: 'btc',
};

/** Rough confirmation time per chain, for the "≈Ns" line. */
const CONFIRMATION_SECONDS: Partial<Record<ChainId, number>> = {
  eth: 30,
  bsc: 15,
  base: 5,
  polygon: 30,
  sol: 5,
  tron: 20,
  ton: 10,
  btc: 1800,
};

export function wireToChainId(wire: string): ChainId | null {
  return WIRE_TO_CHAIN[wire.toUpperCase()] ?? null;
}

function labelFor(wire: string, chain: ChainId): string {
  if (isEvmChain(chain)) return getEvmNetworkName(chain);
  return CHAINS[chain]?.name ?? wire;
}

async function buildQuote(input: {
  wire: string;
  asset: string;
  amount: string;
  senderAddress: string | undefined;
  recipientAddress: string | undefined;
  nativeBalance?: string;
}): Promise<RouteQuote> {
  const chain = wireToChainId(input.wire);
  const isToken = isTokenSymbol(input.asset);
  const base: RouteQuote = {
    network: input.wire,
    label: chain ? labelFor(input.wire, chain) : input.wire,
    estimatedFee: '—',
    estimatedSeconds: chain ? CONFIRMATION_SECONDS[chain] ?? 30 : 30,
    available: false,
    isToken,
    tokenConfigured: false,
  };

  if (!chain) return { ...base, unavailableReason: 'This network is not supported' };
  if (!input.senderAddress) {
    return { ...base, unavailableReason: `You have no ${base.label} wallet` };
  }
  if (!input.recipientAddress) {
    return { ...base, unavailableReason: `They have no ${base.label} wallet` };
  }

  const adapter = getSigningAdapterByWire(input.wire);
  if (!adapter || adapter.availability !== 'available') {
    return {
      ...base,
      unavailableReason: adapter?.unavailableReason ?? 'Sending on this network is not available yet',
    };
  }

  if (isToken && !getConfiguredTokens(chain).some((t) => t.symbol === input.asset)) {
    return { ...base, unavailableReason: `${input.asset} is not available on ${base.label} yet` };
  }

  try {
    const provider = getEvmProvider(chain);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (!gasPrice) throw new Error('no gas price');

    let gasLimit = 21_000n;
    let approximate = false;
    if (isToken) {
      const estimate = await estimateTokenTransferGas({
        symbol: input.asset,
        chain,
        from: input.senderAddress,
        to: input.recipientAddress,
        amount: input.amount,
      });
      gasLimit = estimate.gasLimit;
      approximate = estimate.approximate;
    } else {
      try {
        const estimate = await provider.estimateGas({
          from: input.senderAddress,
          to: input.recipientAddress,
        });
        gasLimit = (estimate * 120n) / 100n;
      } catch {
        // 21k is exact for a plain value transfer; keep it.
      }
    }

    const fee = ethers.formatUnits(gasPrice * gasLimit, 18);
    const nativeBalance =
      input.nativeBalance ??
      (await provider
        .getBalance(ethers.getAddress(input.senderAddress))
        .then((b) => ethers.formatUnits(b, 18))
        .catch(() => undefined));

    const insufficientGas =
      nativeBalance !== undefined && ethers.parseEther(fee) >= ethers.parseEther(nativeBalance);

    return {
      ...base,
      estimatedFee: fee,
      available: true,
      tokenConfigured: true,
      recipientAddress: input.recipientAddress,
      nativeSymbol: nativeSymbolForChain(chain),
      ...(nativeBalance !== undefined ? { nativeBalance } : {}),
      ...(insufficientGas ? { insufficientGas: true } : {}),
      ...(approximate ? { approximateFee: true } : {}),
    };
  } catch {
    return {
      ...base,
      unavailableReason: isToken
        ? `Could not price ${input.asset} on ${base.label} right now`
        : `Could not price ${base.label} right now`,
    };
  }
}

export interface BuildQuotesInput {
  /** The recipient's wallets, as returned by the account resolve endpoint. */
  recipientWallets: RecipientWallet[];
  asset: string;
  amount: string;
  /** Sender addresses keyed by lowercase ChainId, from the wallet store. */
  senderAddresses: Partial<Record<ChainId, string>>;
  /** Optional cached native balances keyed by lowercase ChainId. */
  nativeBalances?: Partial<Record<ChainId, string>>;
}

/**
 * One quote per network the recipient can receive on. Chains are priced in
 * parallel; a single failure yields an `available: false` quote with a reason
 * rather than failing the whole screen.
 */
export async function buildRouteQuotes(input: BuildQuotesInput): Promise<RouteQuote[]> {
  const quotes = await Promise.all(
    input.recipientWallets.map((wallet) => {
      const wire = wallet.chain.toUpperCase();
      const chain = wireToChainId(wire);
      return buildQuote({
        wire,
        asset: input.asset,
        amount: input.amount,
        senderAddress: chain ? input.senderAddresses[chain] : undefined,
        recipientAddress: wallet.address,
        ...(chain && input.nativeBalances?.[chain] !== undefined
          ? { nativeBalance: input.nativeBalances[chain] }
          : {}),
      });
    })
  );

  return quotes;
}

/** Cheapest *usable* quote, or null when nothing is available. */
export function pickRecommended(quotes: RouteQuote[]): RouteQuote | null {
  const usable = quotes.filter((quote) => quote.available && !quote.insufficientGas);
  if (usable.length === 0) return null;
  return usable.reduce((best, quote) => {
    try {
      const fee = ethers.parseEther(quote.estimatedFee);
      const bestFee = ethers.parseEther(best.estimatedFee);
      return fee < bestFee ? quote : best;
    } catch {
      return best;
    }
  });
}
