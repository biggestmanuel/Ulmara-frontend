import { HDNodeWallet, Mnemonic as EthersMnemonic } from 'ethers';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { mnemonicNew, mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton/dist/wallets/WalletContractV4';
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

  // Solana gets its own BIP39 mnemonic
  const solMnemonic = bip39.generateMnemonic(128);

  // TON uses its own native 24-word mnemonic format (not BIP39-compatible).
  const tonMnemonic = await mnemonicNew(24);

  const keys: DerivedChainKey[] = [];

  // --- EVM: eth, bsc, base, polygon share one address ---
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
 * Extracts only the public, transmittable portion of a generated wallet.
 */
export function toPublicAddresses(wallet: GeneratedWallet) {
  return wallet.keys.map(({ chain, address }) => ({ chain, address }));
}