import { HDNodeWallet, Mnemonic as EthersMnemonic, getBytes, sha256 } from 'ethers';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { mnemonicNew, mnemonicToWalletKey } from '@ton/crypto';

import type { ChainId } from '../types/chain';

// ---- Derivation paths ----
const EVM_PATH = "m/44'/60'/0'/0/0";
const TRON_PATH = "m/44'/195'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function toBase58(buffer: Uint8Array): string {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += buffer[i];
    let carry = 0;
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = '';
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result += ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}

/**
 * Standard TRON Base58Check address derivation from an EVM-format address.
 * Tron address = Base58Check( 0x41 + 20-byte-eth-address )
 */
function toTronAddress(ethAddress: string): string {
  const clean = ethAddress.replace(/^0x/, '').toLowerCase();
  const addressBytes = getBytes('0x41' + clean);
  const hash1 = getBytes(sha256(addressBytes));
  const hash2 = getBytes(sha256(hash1));
  const checksum = hash2.slice(0, 4);

  const combined = new Uint8Array(25);
  combined.set(addressBytes);
  combined.set(checksum, 21);

  return toBase58(combined);
}

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
  const evmMnemonic = bip39.generateMnemonic(128);
  const solMnemonic = bip39.generateMnemonic(128);
  const tonMnemonic = await mnemonicNew(24);

  const keys: DerivedChainKey[] = [];

  // --- EVM: eth, bsc, base, polygon ---
  const evmWallet = HDNodeWallet.fromMnemonic(EthersMnemonic.fromPhrase(evmMnemonic), EVM_PATH);
  for (const chain of ['eth', 'bsc', 'base', 'polygon'] as ChainId[]) {
    keys.push({
      chain,
      address: evmWallet.address,
      privateKeyOrSeed: evmWallet.privateKey,
    });
  }

  // --- TRON: same curve, BIP44 path 195, Base58Check address ---
  const tronWallet = HDNodeWallet.fromMnemonic(EthersMnemonic.fromPhrase(evmMnemonic), TRON_PATH);
  const tronAddress = toTronAddress(tronWallet.address);
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
  const { WalletContractV4 } = await import('@ton/ton');
  const tonKeyPair = await mnemonicToWalletKey(tonMnemonic);
  const tonWallet = WalletContractV4.create({ workchain: 0, publicKey: tonKeyPair.publicKey });
  keys.push({
    chain: 'ton',
    address: tonWallet.address.toString({ bounceable: false }),
    privateKeyOrSeed: tonKeyPair.secretKey.toString('hex'),
  });

  return { evmMnemonic, solMnemonic, tonMnemonic, keys };
}

export function toPublicAddresses(wallet: GeneratedWallet) {
  return wallet.keys.map(({ chain, address }) => ({ chain, address }));
}