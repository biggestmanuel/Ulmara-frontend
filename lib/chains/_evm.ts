import { ethers } from 'ethers';

// Shared helper for all EVM chains (ETH, BSC, Base, Polygon).
// Each chain file supplies its own RPC URL + chain metadata.

export interface EvmChainConfig {
  id: string;
  label: string;
  rpcUrl: string;
  chainId: number;
  nativeSymbol: string;
  decimals: number;
}

export function getEvmProvider(config: EvmChainConfig): ethers.JsonRpcProvider {
  // If rpcUrl is missing, fallback to avoid "unsupported protocol" crash
  const url = config.rpcUrl || 'https://cloudflare-eth.com';
  return new ethers.JsonRpcProvider(url, config.chainId);
}

export async function getEvmNativeBalance(
  config: EvmChainConfig,
  address: string
): Promise<string> {
  try {
    const provider = getEvmProvider(config);
    const balanceWei = await provider.getBalance(address);
    return ethers.formatUnits(balanceWei, config.decimals);
  } catch (error) {
    console.error(`[${config.label}] Failed to fetch balance:`, error);
    return '0';
  }
}

export function isValidEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export async function estimateEvmGasFee(config: EvmChainConfig): Promise<string> {
  try {
    const provider = getEvmProvider(config);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 0n;
    const estimatedGasLimit = 21000n; // native transfer baseline
    return ethers.formatUnits(gasPrice * estimatedGasLimit, config.decimals);
  } catch (error) {
    console.error(`[${config.label}] Failed to estimate fee:`, error);
    return '0';
  }
}