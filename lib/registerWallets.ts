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

/** One registered wallet, as `POST /api/wallet/register` answers it. */
export interface RegisteredWallet {
  /** UPPERCASE wire identifier, not the frontend `ChainId`. */
  chain: string;
  address: string;
}

/**
 * What the route answers with, verified live: the eight `{ chain, address }`
 * rows it registered.
 *
 * The response is echoed rather than assumed. It used to be discarded and
 * `{ success: true }` returned as a literal, which was a claim the client had
 * not checked -- and one that stayed true even if the server had stored
 * something different, or fewer rows than were sent.
 */
interface RegisterWalletsResponse {
  chain: string;
  address: string;
}

export interface RegisterWalletsResult {
  /** True only because the route answered 2xx. Never asserted by the client. */
  success: boolean;
  /** The rows the SERVER confirms, in its own chain spelling. */
  registered: RegisteredWallet[];
  /**
   * The same rows mapped back to frontend `ChainId`s, in the order sent.
   *
   * Kept because every caller wants the client-side shape, and the server's is
   * UPPERCASE. Populated from `registered`, not from the request, so it cannot
   * claim a chain was stored that the server did not echo.
   */
  addresses: { chain: ChainId; address: string }[];
}

/** Map one wire chain identifier back to the frontend's `ChainId`. */
function toFrontendChain(wire: string): ChainId | null {
  for (const [id, value] of Object.entries(CHAIN_ID_TO_BACKEND)) {
    if (value === wire) return id as ChainId;
  }
  return null;
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

  let registered: RegisteredWallet[];
try {
    const { data } = await apiClient.post<{ success: boolean; data: RegisterWalletsResponse[] }>(
      '/api/wallet/register',
      { addresses: payload }
    );
    // Read the body rather than assuming our request was honoured. If the server
    // ever echoed fewer rows than were sent, that is a real discrepancy and the
    // user should be told by the failure below rather than by a later balance read
    // that quietly shows nothing.
    registered = Array.isArray(data?.data) ? data.data : [];
    const missing = payload.filter((p) => !registered.some((r) => r.chain === p.chain));
    if (missing.length > 0) {
      fail(
        'register-addresses',
        new Error(
          `the server acknowledged only ${registered.length} of ${payload.length} addresses; ` +
            `missing ${missing.map((m) => m.chain).join(', ')}`
        )
      );
    }
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

  // The confirmed rows, mapped back to `ChainId`. Anything the server echoed
  // that we cannot map is a chain this build does not know about, so it is left
  // out of the client-side list rather than invented an id for.
  const confirmed: { chain: ChainId; address: string }[] = [];
  for (const row of registered) {
    const chainId = toFrontendChain(row.chain);
    if (!chainId) continue;
    const address = row.address;
    if (typeof address !== 'string' || address.length === 0) continue;
    confirmed.push({ chain: chainId, address });
  }

  // 3. Hydrate local wallet state
  //
  // From `confirmed`, not from the request. Hydrating the request would populate
  // the store with addresses the server never confirmed, which is the same
  // unverified claim this change removes one step earlier.
  try {
    for (const { chain, address } of confirmed) {
      useWalletStore.getState().setAddress(chain, address);
    }
  } catch (err) {
    fail('hydrate-wallet-store', err);
  }

  return { success: true, registered, addresses: confirmed };
}