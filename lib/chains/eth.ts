import { EvmChainConfig, getEvmProvider, getEvmNativeBalance, isValidEvmAddress, estimateEvmGasFee } from './_evm';

export const ethConfig: EvmChainConfig = {
  id: 'eth',
  label: 'Ethereum',
  rpcUrl: process.env.EXPO_PUBLIC_RPC_ETH || 'https://ethereum-rpc.publicnode.com',
  chainId: 1,
  nativeSymbol: 'ETH',
  decimals: 18,
};

export const getProvider = () => getEvmProvider(ethConfig);
export const getBalance = (address: string) => getEvmNativeBalance(ethConfig, address);
export const isValidAddress = (address: string) => isValidEvmAddress(address);
export const estimateFee = () => estimateEvmGasFee(ethConfig);