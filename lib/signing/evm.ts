import { ethers } from 'ethers';
import { getEvmMnemonic } from '../storage/secureStorage';

const EVM_PATH = "m/44'/60'/0'/0/0";

const NETWORKS: Record<string, { chainId: number; rpcUrl: string }> = {
  ETH: { chainId: 11155111, rpcUrl: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL ?? process.env.EXPO_PUBLIC_ETH_RPC_URL ?? 'https://rpc.sepolia.org' },
  Sepolia: { chainId: 11155111, rpcUrl: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL ?? process.env.EXPO_PUBLIC_ETH_RPC_URL ?? 'https://rpc.sepolia.org' },
};

export async function signEvmNativeTransfer(input: {
  network: string;
  asset: string;
  to: string;
  amount: string;
}): Promise<string> {
  const network = NETWORKS[input.network];
  if (!network) throw new Error(`EVM signing is not configured for ${input.network}`);
  if (input.asset !== 'ETH') throw new Error('The first EVM implementation supports native ETH transfers only');
  const mnemonic = await getEvmMnemonic();
  if (!mnemonic) throw new Error('Wallet signing credentials are unavailable on this device');

  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, EVM_PATH);
  const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
  const feeData = await provider.getFeeData();
  const nonce = await provider.getTransactionCount(wallet.address, 'pending');
  const transaction = {
    to: ethers.getAddress(input.to),
    value: ethers.parseEther(input.amount),
    nonce,
    chainId: network.chainId,
    gasLimit: 21_000n,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  };
  return wallet.signTransaction(transaction);
}