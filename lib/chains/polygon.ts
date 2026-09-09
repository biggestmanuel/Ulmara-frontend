import { EvmChainConfig, getEvmProvider, getEvmNativeBalance, isValidEvmAddress, estimateEvmGasFee } from './_evm';

export const polygonConfig: EvmChainConfig = {
  id: 'polygon',
  label: 'Polygon',
  rpcUrl: process.env.EXPO_PUBLIC_RPC_POLYGON || 'https://rpc.ankr.com/polygon',
  chainId: 137,
  nativeSymbol: 'POL',
  decimals: 18,
};

export const getProvider = () => getEvmProvider(polygonConfig);
export const getBalance = (address: string) => getEvmNativeBalance(polygonConfig, address);
export const isValidAddress = (address: string) => isValidEvmAddress(address);
export const estimateFee = () => estimateEvmGasFee(polygonConfig);