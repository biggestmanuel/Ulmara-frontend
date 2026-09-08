import axios from 'axios';

const rpcUrl = process.env.EXPO_PUBLIC_RPC_TON || 'https://toncenter.com/api/v2/jsonRPC';

export const tonConfig = {
  id: 'ton',
  label: 'TON',
  nativeSymbol: 'TON',
  decimals: 9,
};

export async function getBalance(address: string): Promise<string> {
  try {
    const response = await axios.post(
      rpcUrl,
      {
        id: 1,
        jsonrpc: '2.0',
        method: 'getAddressInformation',
        params: { address },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const balanceNano = response.data?.result?.balance ?? '0';
    const tonBalance = Number(balanceNano) / 1e9;
    return tonBalance.toString();
  } catch (err) {
    console.error('[TON] Balance check failed:', err);
    return '0';
  }
}