import { ethers } from 'ethers';

import { getEvmMnemonic } from '../storage/secureStorage';
import { getEvmChainId, getEvmProvider, isEvmChain } from '../chains/evmConfig';
import type { ChainId } from '../chains';
import { encodeTokenTransfer, nativeSymbolFor } from '../tokens/erc20';
import { isTokenSymbol } from '../../constants/tokens';

const EVM_PATH = "m/44'/60'/0'/0/0";

/** Chain -> the key that holds its signing material, in UPPERCASE wire form. */
const WIRE_CHAIN: Record<string, ChainId> = {
  ETH: 'eth',
  SEPOLIA: 'eth',
  BSC: 'bsc',
  BASE: 'base',
  POLYGON: 'polygon',
};

function resolveChainId(network: string): ChainId {
  const chain = WIRE_CHAIN[network.toUpperCase()];
  if (!chain) throw new Error(`EVM signing is not configured for ${network}`);
  return chain;
}

async function loadSignerWallet(): Promise<ethers.HDNodeWallet> {
  const mnemonic = await getEvmMnemonic();
  if (!mnemonic) throw new Error('Wallet signing credentials are unavailable on this device');
  return ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, EVM_PATH);
}

/**
 * Signs a **native** EVM transfer.
 *
 * The value field carries the amount, so the backend's
 * `verifySignedTransaction` (which requires `data === "0x"` and
 * `value === parseUnits(amount, 18)`) accepts it unchanged.
 */
export async function signEvmNativeTransfer(input: {
  network: string;
  asset: string;
  to: string;
  amount: string;
}): Promise<string> {
  const chain = resolveChainId(input.network);
  if (input.asset !== nativeSymbolFor(chain)) {
    throw new Error(`The native asset on ${input.network} is ${nativeSymbolFor(chain)}, not ${input.asset}`);
  }
  const wallet = await loadSignerWallet();
  const provider = getEvmProvider(chain);
  const feeData = await provider.getFeeData();
  const nonce = await provider.getTransactionCount(wallet.address, 'pending');
  return wallet.signTransaction({
    to: ethers.getAddress(input.to),
    value: ethers.parseEther(input.amount),
    nonce,
    chainId: getEvmChainId(chain),
    gasLimit: 21_000n,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });
}

/**
 * Signs an **ERC-20** transfer.
 *
 * Two properties matter and are easy to get wrong:
 *
 *  - `value` is **0**, not the token amount. The tokens move through the
 *    contract's `transfer` call; the native value field must stay empty or the
 *    transaction sends ETH as well as tokens.
 *  - `to` is the **token contract**, not the recipient. Getting these two
 *    confused is the classic ERC-20 footgun.
 *
 * The `transactionId` is accepted for interface symmetry with the other chain
 * signers; nothing about the signature binds to it (the intent binding for
 * external transfers is the server's job — see externalTransfers.ts).
 */
export async function signEvmTokenTransfer(input: {
  network: string;
  asset: string;
  to: string;
  amount: string;
  transactionId?: string;
}): Promise<string> {
  const chain = resolveChainId(input.network);
  if (!isTokenSymbol(input.asset)) {
    throw new Error(`${input.asset} is not a supported token`);
  }

  const call = encodeTokenTransfer({
    symbol: input.asset,
    chain,
    to: input.to,
    amount: input.amount,
  });

  const wallet = await loadSignerWallet();
  const provider = getEvmProvider(chain);
  const [feeData, nonce] = await Promise.all([
    provider.getFeeData(),
    provider.getTransactionCount(wallet.address, 'pending'),
  ]);

  // Estimate gas on the real call, with headroom for state growth between
  // estimation and inclusion. A plain `transfer` is ~46k; 65k is the floor.
  let gasLimit = 65_000n;
  try {
    const estimate = await provider.estimateGas({
      from: wallet.address,
      to: call.to,
      data: call.data,
      value: call.value,
    });
    gasLimit = (estimate * 125n) / 100n;
  } catch {
    // Keep the conservative default rather than failing the send.
  }

  return wallet.signTransaction({
    to: call.to,
    data: call.data,
    value: call.value,
    nonce,
    chainId: getEvmChainId(chain),
    gasLimit,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });
}

/** True when this build can sign for the given wire network. */
export function canSignEvm(network: string): boolean {
  const chain = WIRE_CHAIN[network.toUpperCase()];
  return Boolean(chain && isEvmChain(chain));
}

/** The public address the given wire network signs from, for gas previews. */
export async function getEvmSigningAddress(network: string): Promise<string> {
  const wallet = await loadSignerWallet();
  void resolveChainId(network);
  return wallet.address;
}
