import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const rpcUrl = process.env.EXPO_PUBLIC_RPC_SOL || 'https://api.mainnet-beta.solana.com';

export const solConfig = {
  id: 'sol',
  label: 'Solana',
  nativeSymbol: 'SOL',
  decimals: 9,
};

let connection: Connection | null = null;
export function getSolConnection(): Connection {
  if (!connection) {
    connection = new Connection(rpcUrl, 'confirmed');
  }
  return connection;
}

export async function getBalance(address: string): Promise<string> {
  try {
    const conn = getSolConnection();
    const pubKey = new PublicKey(address);
    const lamports = await conn.getBalance(pubKey);
    return (lamports / LAMPORTS_PER_SOL).toString();
  } catch (err) {
    console.error('[SOL] Balance check failed:', err);
    return '0';
  }
}

export function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}