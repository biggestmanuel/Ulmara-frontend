/**
 * DESTINATION: lib/keyGeneration.ts (new file)
 *
 * Client-side, non-custodial key generation for Zomavi.
 * Generates mnemonics and derives addresses for every supported chain.
 * Private keys / mnemonics NEVER leave the device — only public addresses
 * are sent to the backend via registerWallets().
 *
 * Chain groups:
 *  - EVM (eth, bsc, base, polygon): one BIP39 mnemonic, standard BIP44 secp256k1 derivation via ethers
 *  - tron: same curve as EVM, separate derivation path + base58check address
 *  - sol: ed25519, separate BIP39 mnemonic, derived via ed25519-hd-key, keypair built with
 *    @solana/web3.js (already a project dependency)
 *  - ton: separate 24-word TON-native mnemonic via @ton/crypto, WalletContractV4
 *
 * NEW DEPENDENCIES REQUIRED (not currently in package.json):
 *   npm install bip39 ed25519-hd-key
 * Everything else (ethers, tronweb, @ton/crypto, @ton/ton, @solana/web3.js) is already installed.
 */

import { HDNodeWallet, Mnemonic as EthersMnemonic } from 'ethers';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { mnemonicNew, mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
// tronweb does not ship TypeScript declarations in the installed version.
// Keep the dependency typed locally until a compatible declaration is added.
// @ts-expect-error tronweb has no declaration file
import TronWeb from 'tronweb';

import type { ChainId } from '../types/chain';

// ---- Derivation paths ----
const EVM_PATH = "m/44'/60'/0'/0/0";
const TRON_PATH = "m/44'/195'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

export interface DerivedChainKey {
  chain: ChainId;
  address: string;
  privateKeyOrSeed: string; // hex, chain-dependent — never transmitted
}

export interface GeneratedWallet {
  evmMnemonic: string; // covers eth, bsc, base, polygon, tron
  solMnemonic: string;
  tonMnemonic: string[]; // TON mnemonics are 24-word arrays, not a single BIP39 string
  keys: DerivedChainKey[];
}

/**
 * Generates a fresh, non-custodial wallet covering all 7 supported chains.
 * Call this exactly once per account, then persist the mnemonics via
 * secureStorage and register only the derived addresses with the backend.
 */
export async function generateWallet(): Promise<GeneratedWallet> {
  // One 12-word BIP39 mnemonic drives EVM chains + TRON (both secp256k1).
  const evmMnemonic = bip39.generateMnemonic(128); // 12 words

  // Solana gets its own BIP39 mnemonic (kept separate so a chain-specific
  // compromise doesn't cascade across curve families).
  const solMnemonic = bip39.generateMnemonic(128);

  // TON uses its own native 24-word mnemonic format (not BIP39-compatible).
  const tonMnemonic = await mnemonicNew(24);

  const keys: DerivedChainKey[] = [];

  // --- EVM: eth, bsc, base, polygon share one address (same derivation, same curve) ---
  const evmWallet = HDNodeWallet.fromMnemonic(EthersMnemonic.fromPhrase(evmMnemonic), EVM_PATH);
  for (const chain of ['eth', 'bsc', 'base', 'polygon'] as ChainId[]) {
    keys.push({
      chain,
      address: evmWallet.address,
      privateKeyOrSeed: evmWallet.privateKey,
    });
  }

  // --- TRON: same curve family, different path + base58check address ---
  const tronWallet = HDNodeWallet.fromMnemonic(EthersMnemonic.fromPhrase(evmMnemonic), TRON_PATH);
  // NOTE: verify this static call against your installed tronweb@5.3.0 — some
  // versions expose address utils only on an instantiated TronWeb instance
  // (e.g. `new TronWeb({fullHost}).address.fromPrivateKey(...)`) rather than statically.
  const tronAddress = TronWeb.address.fromPrivateKey(tronWallet.privateKey.replace(/^0x/, ''));
  keys.push({
    chain: 'tron',
    address: tronAddress,
    privateKeyOrSeed: tronWallet.privateKey,
  });

  // --- Solana: ed25519 derivation, keypair built via @solana/web3.js ---
  const solSeed = await bip39.mnemonicToSeed(solMnemonic);
  const { key: solDerivedSeed } = derivePath(SOL_PATH, solSeed.toString('hex'));
  const solKeypair = Keypair.fromSeed(solDerivedSeed);
  keys.push({
    chain: 'sol',
    address: solKeypair.publicKey.toBase58(),
    privateKeyOrSeed: Buffer.from(solKeypair.secretKey).toString('hex'),
  });

  // --- TON: native mnemonic -> wallet key -> V4 wallet contract address ---
  const tonKeyPair = await mnemonicToWalletKey(tonMnemonic);
  const tonWallet = WalletContractV4.create({ workchain: 0, publicKey: tonKeyPair.publicKey });
  keys.push({
    chain: 'ton',
    address: tonWallet.address.toString({ bounceable: false }),
    privateKeyOrSeed: tonKeyPair.secretKey.toString('hex'),
  });

  return { evmMnemonic, solMnemonic, tonMnemonic, keys };
}

/**
 * Extracts only the public, transmittable portion of a generated wallet —
 * the shape expected by registerWallets() before it maps to the backend's
 * uppercase Chain enum.
 */
export function toPublicAddresses(wallet: GeneratedWallet) {
  return wallet.keys.map(({ chain, address }) => ({ chain, address }));
}
