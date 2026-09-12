import { apiClient } from './api/client';
import { 
  saveEvmMnemonic, 
  saveSolMnemonic, 
  saveTonMnemonic,
} from './storage/secureStorage';
import { useWalletStore } from '../stores/walletStore';
import type { ChainId } from '../types/chain';

const CHAIN_ID_TO_BACKEND: Record<ChainId, string> = {
  eth: 'ETH',
  bsc: 'BSC',
  base: 'BASE',
  polygon: 'POLYGON',
  tron: 'TRON',
  sol: 'SOL',
  ton: 'TON',
};

export interface RegisterWalletsResult {
  success: boolean;
  addresses: { chain: ChainId; address: string }[];
}

// In-memory cache so retries don't regenerate keys
let inMemoryWallet: any = null;

export async function setupNonCustodialWallet(): Promise<RegisterWalletsResult> {
  const { generateWallet, toPublicAddresses } = await import('./keyGeneration');

  // Check in-memory cache first to avoid re-running slow math on retry
  let wallet = inMemoryWallet;
  
  if (!wallet) {
    wallet = await generateWallet();
    inMemoryWallet = wallet;

    // 1. Persist secrets locally
    await saveEvmMnemonic(wallet.evmMnemonic);
    await saveSolMnemonic(wallet.solMnemonic);
    await saveTonMnemonic(wallet.tonMnemonic);
  }

  // 2. Register only public addresses
  const addresses = toPublicAddresses(wallet);
  const payload = addresses.map(({ chain, address }) => ({
    chain: CHAIN_ID_TO_BACKEND[chain],
    address,
  }));

  await apiClient.post('/api/wallet/register', { addresses: payload });

  // Clear in-memory cache once successfully registered
  inMemoryWallet = null;

  // 3. Hydrate local wallet state
  for (const { chain, address } of addresses) {
    useWalletStore.getState().setAddress(chain, address);
  }

  return { success: true, addresses };
}