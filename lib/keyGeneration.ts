import { HDNodeWallet, getBytes, sha256 } from 'ethers';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { mnemonicToWalletKey } from '@ton/crypto';
import { Cell, beginCell, contractAddress } from '@ton/core';
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

// Standard Wallet V4 R2 compiled code cell base64
const WALLET_V4R2_CODE_B64 = 'te6ccgECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVA==';

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
  const tonKeyPair = await mnemonicToWalletKey(tonMnemonic);

  // Build Wallet V4 R2 directly using @ton/core (NO @ton/ton dependency!)
  const workchain = 0;
  const walletId = 698983191 + workchain;
  const code = Cell.fromBoc(Buffer.from(WALLET_V4R2_CODE_B64, 'base64'))[0];
  const data = beginCell()
    .storeUint(0, 32) // seqno
    .storeUint(walletId, 32)
    .storeBuffer(Buffer.from(tonKeyPair.publicKey))
    .storeBit(0) // empty plugins dict
    .endCell();

  const address = contractAddress(workchain, { code, data });
  const tonAddress = address.toString({ bounceable: false });
  console.log('[KeyGen] TON Address:', tonAddress);

  keys.push({
    chain: 'ton',
    address: tonAddress,
    privateKeyOrSeed: Buffer.from(tonKeyPair.secretKey).toString('hex'),
  });

  console.log('[KeyGen] SUCCESS! All 7 chains generated!');
  return { evmMnemonic, solMnemonic, tonMnemonic, keys };
}

export function toPublicAddresses(wallet: GeneratedWallet) {
  return wallet.keys.map(({ chain, address }) => ({ chain, address }));
}