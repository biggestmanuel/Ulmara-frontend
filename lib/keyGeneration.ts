import { HDNodeWallet, getBytes, sha256 } from 'ethers';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { mnemonicToWalletKey } from '@ton/crypto';
import { Buffer } from 'buffer';

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
  privateKeyOrSeed: string;
}

export interface GeneratedWallet {
  evmMnemonic: string;
  solMnemonic: string;
  tonMnemonic: string[];
  keys: DerivedChainKey[];
}

export async function generateWallet(): Promise<GeneratedWallet> {
  console.log('[KeyGen] 1. Generating mnemonics...');

  // EVM & TRON (12 words)
  const evmMnemonic = bip39.generateMnemonic(128);

  // Solana (12 words)
  const solMnemonic = bip39.generateMnemonic(128);

  // TON: 24 words generated via BIP-39 (256-bit entropy)
  const tonMnemonicPhrase = bip39.generateMnemonic(256);
  const tonMnemonic = tonMnemonicPhrase.split(' ');

  console.log('[KeyGen] 2. Deriving EVM chains...');
  const keys: DerivedChainKey[] = [];

  const evmSeed = await bip39.mnemonicToSeed(evmMnemonic);
  const rootNode = HDNodeWallet.fromSeed(evmSeed);
  const evmWallet = rootNode.derivePath(EVM_PATH);
  console.log('[KeyGen] EVM Address:', evmWallet.address);

  for (const chain of ['eth', 'bsc', 'base', 'polygon'] as ChainId[]) {
    keys.push({
      chain,
      address: evmWallet.address,
      privateKeyOrSeed: evmWallet.privateKey,
    });
  }

  console.log('[KeyGen] 3. Deriving TRON...');
  const tronWallet = rootNode.derivePath(TRON_PATH);
  const tronAddress = toTronAddress(tronWallet.address);
  console.log('[KeyGen] TRON Address:', tronAddress);

  keys.push({
    chain: 'tron',
    address: tronAddress,
    privateKeyOrSeed: tronWallet.privateKey,
  });

  console.log('[KeyGen] 4. Deriving Solana...');
  const solSeed = await bip39.mnemonicToSeed(solMnemonic);
  const { key: solDerivedSeed } = derivePath(SOL_PATH, solSeed.toString('hex'));
  const solKeypair = Keypair.fromSeed(solDerivedSeed);
  const solAddress = solKeypair.publicKey.toBase58();
  console.log('[KeyGen] Solana Address:', solAddress);

  keys.push({
    chain: 'sol',
    address: solAddress,
    privateKeyOrSeed: Buffer.from(solKeypair.secretKey).toString('hex'),
  });

  console.log('[KeyGen] 5. Deriving TON...');
  // Force Buffer and Buffer.alloc onto the global scope right before loading @ton/ton
  (global as any).Buffer = Buffer;
  (globalThis as any).Buffer = Buffer;
  if (!(global as any).Buffer.alloc) {
    (global as any).Buffer.alloc = Buffer.alloc;
    (globalThis as any).Buffer.alloc = Buffer.alloc;
  }

  const { WalletContractV4 } = await import('@ton/ton');
  const tonKeyPair = await mnemonicToWalletKey(tonMnemonic);
  const tonWallet = WalletContractV4.create({ workchain: 0, publicKey: tonKeyPair.publicKey });
  const tonAddress = tonWallet.address.toString({ bounceable: false });
  console.log('[KeyGen] TON Address:', tonAddress);

  keys.push({
    chain: 'ton',
    address: tonAddress,
    privateKeyOrSeed: tonKeyPair.secretKey.toString('hex'),
  });

  console.log('[KeyGen] SUCCESS! All 7 chains generated!');
  return { evmMnemonic, solMnemonic, tonMnemonic, keys };
}

export function toPublicAddresses(wallet: GeneratedWallet) {
  return wallet.keys.map(({ chain, address }) => ({ chain, address }));
}