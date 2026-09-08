import axios from 'axios';

const rpcUrl = process.env.EXPO_PUBLIC_RPC_TRON || 'https://api.trongrid.io';

export const tronConfig = {
  id: 'tron',
  label: 'TRON',
  nativeSymbol: 'TRX',
  decimals: 6,
};

export async function getBalance(address: string): Promise<string> {
  try {
    const response = await axios.post(
      `${rpcUrl}/wallet/getaccount`,
      { address },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const balanceSun = response.data?.balance ?? 0;
    return (balanceSun / 1e6).toString();
  } catch (error) {
    console.error('[TRON] Failed to fetch balance:', error);
    return '0';
  }
}