import { EvmChainConfig, getEvmProvider, getEvmNativeBalance, isValidEvmAddress, estimateEvmGasFee } from './_evm';

export const bscConfig: EvmChainConfig = {
  id: 'bsc',
  label: 'BNB Smart Chain',
  rpcUrl: process.env.EXPO_PUBLIC_RPC_BSC || 'https://binance.llamarpc.com',
  chainId: 56,
  nativeSymbol: 'BNB',
  decimals: 18,
};

export const getProvider = () => getEvmProvider(bscConfig);
export const getBalance = (address: string) => getEvmNativeBalance(bscConfig, address);
export const isValidAddress = (address: string) => isValidEvmAddress(address);
export const estimateFee = () => estimateEvmGasFee(bscConfig);