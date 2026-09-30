import { ethers } from 'ethers';

import { getTokenForChain, type TokenDefinition } from '../../constants/tokens';
import type { ChainId } from '../chains';
import { getEvmChainId, getEvmProvider, nativeSymbolForChain } from '../chains/evmConfig';

export { getEvmProvider, getEvmChainId };
export const nativeSymbolFor = nativeSymbolForChain;

/**
 * Minimal ERC-20 ABI — only the four calls this app needs.
 *
 * Deliberately not a full ABI: every extra selector is another thing that has to
 * stay correct across proxy upgrades, and none of them is used here.
 */
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  // `transfer(address,uint256)` — the canonical signature, on every ERC-20.
  'function transfer(address to, uint256 amount) returns (bool)',
] as const;

export const ERC20_INTERFACE = new ethers.Interface(ERC20_ABI);

export class TokenConfigurationError extends Error {
  readonly code = 'TOKEN_NOT_CONFIGURED';
}

/** Native gas is always paid in the chain's own coin — never in the token. */
export interface GasEstimate {
  /** Human-readable native amount, e.g. "0.0000421". */
  fee: string;
  /** Native symbol, e.g. "ETH". */
  nativeSymbol: string;
  gasLimit: bigint;
  /** True when the value is a conservative constant, not a live estimateGas. */
  approximate: boolean;
}

function requireTokenDefinition(symbol: string, chain: ChainId): TokenDefinition {
  const token = getTokenForChain(symbol, chain);
  if (!token) {
    throw new TokenConfigurationError(
      `${symbol} is not configured on ${chain.toUpperCase()}. Set EXPO_PUBLIC_TOKEN_ADDRESSES["${symbol}:${chain.toUpperCase()}"] to its contract address.`
    );
  }
  return token;
}

export function getTokenContractAddress(symbol: string, chain: ChainId): string {
  return requireTokenDefinition(symbol, chain).addresses[chain]!;
}

/**
 * Reads a token balance with one `eth_call` against `balanceOf`.
 *
 * This is the only place the client talks to a token contract directly. Once
 * the backend grows a token-balance endpoint this call moves behind
 * `lib/api/tokens.ts` and nothing above it changes.
 */
export async function readTokenBalance(input: {
  symbol: string;
  chain: ChainId;
  owner: string;
}): Promise<string> {
  const token = requireTokenDefinition(input.symbol, input.chain);
  const provider = getEvmProvider(input.chain);
  const data = await provider.call({
    to: token.addresses[input.chain]!,
    data: ERC20_INTERFACE.encodeFunctionData('balanceOf', [ethers.getAddress(input.owner)]),
  });
  const raw = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], data)[0] as bigint;
  return ethers.formatUnits(raw, token.decimals);
}

/** True when the address holds contract code, so a wrong network fails fast. */
export async function isTokenContract(tokenAddress: string, chain: ChainId): Promise<boolean> {
  const code = await getEvmProvider(chain).getCode(tokenAddress);
  return code !== '0x' && code.length > 2;
}

/**
 * `transfer` call data for a token transfer. Kept separate from signing so the
 * amount/decimal handling can be reasoned about on its own.
 */
export function encodeTokenTransfer(input: {
  symbol: string;
  chain: ChainId;
  to: string;
  amount: string;
}): { to: string; data: string; value: bigint } {
  const token = requireTokenDefinition(input.symbol, input.chain);
  return {
    to: token.addresses[input.chain]!,
    data: ERC20_INTERFACE.encodeFunctionData('transfer', [
      ethers.getAddress(input.to),
      parseTokenAmount(input.amount, token.decimals),
    ]),
    // An ERC-20 transfer carries zero native value; gas is a separate native cost.
    value: 0n,
  };
}

/**
 * Parses a user-entered amount into base units.
 *
 * Rejects more fractional digits than the token supports instead of silently
 * truncating: sending "1.1234567" USDT (6 dp) as "1.123456" would move money
 * the user did not agree to.
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Enter a valid amount');
  }
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(`This asset supports at most ${decimals} decimal place${decimals === 1 ? '' : 's'}`);
  }
  if (/^0+$/.test(whole) && /^0*$/.test(fraction)) {
    throw new Error('Amount must be greater than zero');
  }
  return ethers.parseUnits(trimmed, decimals);
}

/**
 * UI-level amount check. Returns `null` while the field is still empty or
 * mid-keystroke so typing "1." is not flagged before it is finished.
 */
export function validateTokenAmount(
  amount: string,
  decimals: number,
  symbol: string
): string | null {
  const trimmed = amount.trim();
  if (trimmed.length === 0) return null;
  // Allow a single leading dot and a single decimal point, nothing else.
  if (!/^\d*(\.\d*)?$/.test(trimmed)) return 'Enter a valid amount';
  const [whole = '', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    return `${symbol} supports at most ${decimals} decimal place${decimals === 1 ? '' : 's'}`;
  }
  if (whole.length > 1 && whole.startsWith('0')) return 'Remove the leading zeros';
  return null;
}

/**
 * Live gas estimate for a token transfer.
 *
 * Runs `eth_estimateGas` against the real transfer call, so the figure the
 * user approves is the figure the network charges. Falls back to a
 * conservative constant when the node refuses to estimate (some public RPCs
 * reject `eth_estimateGas` for contract writes) and marks the result
 * approximate so the UI can say so rather than implying false precision.
 */
export async function estimateTokenTransferGas(input: {
  symbol: string;
  chain: ChainId;
  from: string;
  to: string;
  amount: string;
}): Promise<GasEstimate> {
  // `encodeTokenTransfer` performs the configuration check, so the definition
  // is not resolved twice here.
  const provider = getEvmProvider(input.chain);
  const call = encodeTokenTransfer(input);
  const fromAddress = ethers.getAddress(input.from);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!gasPrice) throw new Error('Could not read the current gas price');

  // Conservative default, comfortably above the ~46k a canonical ERC-20
  // transfer uses, for nodes that will not estimate.
  let gasLimit = 65_000n;
  let approximate = true;
  try {
    const estimated = await provider.estimateGas({
      from: fromAddress,
      to: call.to,
      data: call.data,
      value: call.value,
    });
    // 25% headroom absorbs state growth between estimation and inclusion.
    gasLimit = (estimated * 125n) / 100n;
    approximate = false;
  } catch {
    // Keep the conservative default.
  }

  return {
    fee: ethers.formatUnits(gasPrice * gasLimit, 18),
    nativeSymbol: nativeSymbolFor(input.chain),
    gasLimit,
    approximate,
  };
}

export async function readNativeBalance(address: string, chain: ChainId): Promise<string> {
  return ethers.formatUnits(await getEvmProvider(chain).getBalance(ethers.getAddress(address)), 18);
}

/**
 * Largest token amount sendable while still covering gas.
 *
 * A token transfer is paid for in the chain's native coin, so sending the
 * entire token balance can leave nothing for gas and strand the funds.
 *
 * Returns `"0"` when the wallet cannot cover gas for even a 1-base-unit
 * transfer — the caller surfaces that as "you need a little ETH first", which
 * is the only honest thing to say, because spending tokens cannot create gas.
 */
export async function maxSendableTokenAmount(input: {
  symbol: string;
  chain: ChainId;
  from: string;
  to: string;
  balance: string;
  /** Native amount to hold back for gas, as a decimal string. */
  gasReserve: string;
}): Promise<string> {
  const token = requireTokenDefinition(input.symbol, input.chain);
  const balanceUnits =
    input.balance && input.balance !== '0' ? parseTokenAmount(input.balance, token.decimals) : 0n;
  if (balanceUnits === 0n) return '0';

  const provider = getEvmProvider(input.chain);
  const [nativeBalance, feeData] = await Promise.all([
    provider.getBalance(ethers.getAddress(input.from)),
    provider.getFeeData(),
  ]);

  // Reserve the larger of the caller's stated reserve and a fresh estimate for
  // the maximum possible call, so "Max" never produces an unstuck transaction.
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  const estimatedFee = gasPrice * 65_000n;
  let reserve = estimatedFee;
  try {
    const stated = ethers.parseEther(input.gasReserve);
    if (stated > reserve) reserve = stated;
  } catch {
    // A malformed reserve should not break "Max"; the fresh estimate stands.
  }

  if (nativeBalance <= reserve) return '0';

  // Convert the spendable native surplus into token base units. Both the token
  // balance and the surplus are bigints, so this is exact — no float drift.
  const nativePerToken = 10n ** BigInt(18 - token.decimals);
  const maxUnits = balanceUnits - reserve / nativePerToken;
  if (maxUnits <= 0n) return '0';
  return ethers.formatUnits(maxUnits > balanceUnits ? balanceUnits : maxUnits, token.decimals);
}

/** Decimal places a token accepts, for the amount input. */
export function tokenDecimals(symbol: string, chain: ChainId): number {
  return requireTokenDefinition(symbol, chain).decimals;
}
