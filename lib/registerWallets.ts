import { apiClient } from './api/client';
import { saveEvmMnemonic, saveSolMnemonic, saveTonMnemonic } from './storage/secureStorage';
import { useWalletStore } from '../stores/walletStore';
import { WalletGenerationStepError } from './keyGeneration';
import type { ChainId } from '../types/chain';

// UPPERCASE wire identifiers — exactly the values the backend accepts for
// POST /api/wallet/register (wallet.service SUPPORTED_CHAINS, sourced from
// its CHAIN_NAMES enum; case-sensitive).
const CHAIN_ID_TO_BACKEND: Partial<Record<ChainId, string>> = {
  eth: 'ETH',
  bsc: 'BSC',
  base: 'BASE',
  polygon: 'POLYGON',
  tron: 'TRON',
  sol: 'SOL',
  ton: 'TON',
  btc: 'BTC',
};

export interface RegisterWalletsResult {
  success: boolean;
  addresses: { chain: ChainId; address: string }[];
}

// In-memory cache so retries don't regenerate keys
type GeneratedWallet = Awaited<ReturnType<typeof import('./keyGeneration')['generateWallet']>>;
let inMemoryWallet: GeneratedWallet | null = null;

// Wraps a setup-stage failure with the step that failed. Only step names and
// the underlying error message are included — never seed phrases, mnemonics,
// private keys, or address payloads.
function fail(step: string, err: unknown): never {
  if (err instanceof WalletGenerationStepError) throw err;
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`Wallet setup failed [step=${step}]: ${message}`);
}

export async function setupNonCustodialWallet(): Promise<RegisterWalletsResult> {
  let generateWallet: typeof import('./keyGeneration')['generateWallet'];
  let toPublicAddresses: typeof import('./keyGeneration')['toPublicAddresses'];
  try {
    ({ generateWallet, toPublicAddresses } = await import('./keyGeneration'));
  } catch (err) {
    fail('load-key-generation-module', err);
  }

  // Check in-memory cache first to avoid re-running slow math on retry
  let wallet = inMemoryWallet;
  
  if (!wallet) {
    try {
      wallet = await generateWallet();
    } catch (err) {
      // Chain/step-tagged trace for support. Messages from
      // WalletGenerationStepError carry only chain names, step names, and the
      // underlying error text — never mnemonics or private keys.
      const details =
        err instanceof WalletGenerationStepError
          ? `[chain=${err.chain}] [step=${err.step}] ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      console.error('[wallet-setup] generateWallet failed:', details);
      throw err;
    }
    inMemoryWallet = wallet;

    // 1. Persist secrets locally
    try {
      const saved = await Promise.all([
        saveEvmMnemonic(wallet.evmMnemonic),
        saveSolMnemonic(wallet.solMnemonic),
        saveTonMnemonic(wallet.tonMnemonic),
      ]);
      if (saved.some((value) => !value)) {
        throw new Error('Could not securely store wallet recovery material. Wallet setup was not completed.');
      }
    } catch (err) {
      fail('persist-mnemonics', err);
    }
  }

  // 2. Register only public addresses
  const addresses = toPublicAddresses(wallet);
  const payload = addresses.map(({ chain, address }) => ({
    chain: CHAIN_ID_TO_BACKEND[chain]!,
    address,
  }));

  try {
    await apiClient.post('/api/wallet/register', { addresses: payload });
  } catch (err) {
    // Payload contains public addresses only, so logging the chains is safe;
    // the address values themselves stay out of the log.
    console.error(
      '[wallet-setup] register-addresses failed:',
      payload.map(({ chain }) => chain).join(','),
      err instanceof Error ? err.message : String(err)
    );
    const status = (err as { status?: number }).status;
    fail(`register-addresses${status ? ` [httpStatus=${status}]` : ''}`, err);
  }

  // Clear in-memory cache once successfully registered
  inMemoryWallet = null;

  // 3. Hydrate local wallet state
  try {
    for (const { chain, address } of addresses) {
      useWalletStore.getState().setAddress(chain, address);
    }
  } catch (err) {
    fail('hydrate-wallet-store', err);
  }

  return { success: true, addresses };
}