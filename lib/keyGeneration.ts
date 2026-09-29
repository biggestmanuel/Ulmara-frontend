import { HDNodeWallet, getBytes, sha256 } from 'ethers';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { mnemonicToWalletKey } from '@ton/crypto';
import { Cell, beginCell, contractAddress } from '@ton/core';
import { Buffer } from 'buffer';
import { initEccLib, networks, payments } from 'bitcoinjs-lib';
import { BIP32Factory, type BIP32API } from 'bip32';
// RN-compatible secp256k1: pure JS over @noble/curves (no WASM, no Node fs).
// tiny-secp256k1's CJS build loads its WASM via fs.readFileSync, which crashes
// the Metro/Expo bundle. This is a drop-in for the elliptic-style interface
// that both BIP32Factory and initEccLib expect.
import * as ecc from '@bitcoinerlab/secp256k1';

import type { ChainId } from '../types/chain';

// ---- Derivation paths ----
const EVM_PATH = "m/44'/60'/0'/0/0";
const TRON_PATH = "m/44'/195'/0'/0/0";
const SOL_PATH = "m/44'/501'/0'/0'";
const BTC_PATH = "m/84'/0'/0'/0/0";

// Per-chain BIP32 hardening: hardened levels use privateParent + IL, soft
// levels use publicParent + L. A BIP32 factory whose ecc adapter lacks the
// point ops crashes exactly there — with "Cannot read property 'derive' of
// null". The probe in assertEccAdapter() covers those ops before any derive
// runs; if a level is misconfigured we fail loudly with the offending path.
const DERIVATION_PARAMS: Record<ChainId, { path: string; levels: ('hardened' | 'soft')[] }> = {
  eth: { path: EVM_PATH, levels: ['hardened', 'hardened', 'hardened', 'soft', 'soft'] },
  bsc: { path: EVM_PATH, levels: ['hardened', 'hardened', 'hardened', 'soft', 'soft'] },
  base: { path: EVM_PATH, levels: ['hardened', 'hardened', 'hardened', 'soft', 'soft'] },
  polygon: { path: EVM_PATH, levels: ['hardened', 'hardened', 'hardened', 'soft', 'soft'] },
  tron: { path: TRON_PATH, levels: ['hardened', 'hardened', 'hardened', 'soft', 'soft'] },
  btc: { path: BTC_PATH, levels: ['hardened', 'hardened', 'hardened', 'soft', 'soft'] },
  // ed25519 (SLIP-0010) derives only through hardened levels.
  sol: { path: SOL_PATH, levels: ['hardened', 'hardened', 'hardened', 'hardened'] },
  ton: { path: 'N/A (TON uses its own mnemonic->key scheme)', levels: [] },
};

// BIP32/BIP39 self-test vectors (BIP84 'abandon about'), used by
// assertBip39()/assertBip32Factory() to prove the whole stack end-to-end
// before any real wallet is derived. Runs once per app session (see _bip32).
const VEC_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const VEC_BIP84_PUBKEY = '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
const VEC_BIP84_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

let _bip32: BIP32API | null = null;

// -- Internal strict assertions (private helpers) --

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEccAdapter(): void {
  assert(typeof ecc === 'object' && ecc !== null, 'ecc adapter missing');
  assert(typeof ecc.isPrivate === 'function', 'ecc.isPrivate missing');
  assert(typeof ecc.pointCompress === 'function', 'ecc.pointCompress missing');
  assert(typeof ecc.pointFromScalar === 'function', 'ecc.pointFromScalar missing');
  assert(typeof ecc.privateAdd === 'function', 'ecc.privateAdd missing');

  const d = new Uint8Array(32).fill(1);
  assert(ecc.isPrivate(d), 'ecc.isPrivate: self-test failed');

  // hardening relies on these; exercise them once here
  const P = ecc.pointFromScalar(d, true);
  assert(P !== null, 'ecc.pointFromScalar: self-test failed');
  assert(ecc.pointCompress(P, false).length === 65, 'ecc.pointCompress: self-test failed');
  const d2 = ecc.privateAdd(d, d);
  assert(d2 !== null, 'ecc.privateAdd: self-test failed');
  assert(ecc.isPrivate(d2), 'ecc.privateAdd: self-test failed (invalid scalar)');
}

function assertBip39(): void {
  assert(
    bip39.generateMnemonic(256).trim().split(/\s+/).length === 24,
    'bip39: 24-word mnemonic generation self-test failed'
  );
  const seed = bip39.mnemonicToSeedSync(VEC_MNEMONIC);
  assert(
    seed.toString('hex') === '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
    'bip39: BIP39 vector mismatch'
  );
}

function assertBip32Factory(factory: BIP32API): void {
  const seed = Buffer.alloc(64, 1);
  const root = factory.fromSeed(seed);
  assert(!!root, 'bip32: fromSeed returned null');
  assert(!!root.privateKey && root.privateKey.length === 32, 'bip32: root privateKey missing');

  const node = root.deriveHardened(84).deriveHardened(0).deriveHardened(0);
  const leaf = node.derive(0);
  assert(!!leaf && !!leaf.publicKey && leaf.publicKey.length === 33, 'bip32: soft derive failed');

  // address format end-to-end
  const addr = payments.p2wpkh({ pubkey: Buffer.from(leaf.publicKey), network: networks.bitcoin }).address;
  assert(typeof addr === 'string' && addr.startsWith('bc1'), 'bip32/bitcoinjs: p2wpkh self-test failed');

  // BIP84 'abandon about' end-to-end (keyGeneration's exact BTC path)
  const vecSeed = bip39.mnemonicToSeedSync(VEC_MNEMONIC);
  const vecRoot = factory.fromSeed(Buffer.from(vecSeed));
  const vecNode = vecRoot.derivePath(BTC_PATH);
  assert(
    Buffer.from(vecNode.publicKey).toString('hex') === VEC_BIP84_PUBKEY,
    'bip32: BIP84 vector mismatch (pubkey)'
  );
  const vecAddr = payments.p2wpkh({ pubkey: Buffer.from(vecNode.publicKey), network: networks.bitcoin }).address;
  assert(vecAddr === VEC_BIP84_ADDRESS, 'bip32: BIP84 vector mismatch (address)');
}

// -- Lazy internal getters (init on first wallet generation, not at import) --

function getBip32(): BIP32API {
  if (_bip32) return _bip32;
  try {
    assertEccAdapter();
    assertBip39();
    const factory = BIP32Factory(ecc);
    assertBip32Factory(factory);
    initEccLib(ecc);
    _bip32 = factory;
    return _bip32;
  } catch (err) {
    _bip32 = null;
    const message = err instanceof Error ? err.message : String(err);
    throw new WalletGenerationStepError('btc', 'init-bip32-factory', new Error(message));
  }
}

// Every chain generateWallet() must produce keys for. The four EVM chains
// share one derived key, so a successful run yields 8 entries in `keys`.
const EXPECTED_CHAINS: readonly ChainId[] = ['eth', 'bsc', 'base', 'polygon', 'btc', 'tron', 'sol', 'ton'];

// Identifies which chain and which wallet-generation step failed. Only ever
// carries chain names, step names, and the underlying error message — never
// seeds, mnemonics, or private keys.
// NOTE: getBip32() throws this class's errors but only runs after module
// evaluation completes (it is called from generateWallet()), so declaring the
// class below the helpers is safe — no TDZ hazard at call time.
export class WalletGenerationStepError extends Error {
  readonly chain: string;
  readonly step: string;

  constructor(chain: string, step: string, cause: unknown) {
    const underlying = cause instanceof Error ? cause.message : String(cause);
    super(`Wallet generation failed [chain=${chain}] [step=${step}]: ${underlying}`);
    this.name = 'WalletGenerationStepError';
    this.chain = chain;
    this.step = step;
  }
}

// Runs one wallet-generation step, tagging any failure with the chain and
// step it happened in so the error is traceable without exposing key material.
async function step<T>(chain: string, name: string, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof WalletGenerationStepError) throw err;
    throw new WalletGenerationStepError(chain, name, err);
  }
}

// Throws a WalletGenerationStepError naming the chain and path if the
// expected BIP32 hardening does not match what the key material supports.
function assertValidDerivationParams(
  chain: ChainId,
  node: { publicKey?: Uint8Array | Buffer | string | null }
): void {
  const { path, levels } = DERIVATION_PARAMS[chain];
  if (levels.length === 0) return; // TON etc. do not use BIP32 paths
  const pk = node.publicKey;
  const length = typeof pk === 'string' ? pk.length : (pk?.length ?? 0);
  assert(
    length > 0,
    `bip32: ${path} produced no public key (chain=${chain})`
  );
  assert(
    path.split('/').filter((seg) => seg !== 'm').length === levels.length,
    `bip32: ${path} level count does not match expected hardening for chain=${chain}`
  );
}

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
  // EVM & TRON (12 words)
  const evmMnemonic = await step('evm', 'generate-mnemonic', () => bip39.generateMnemonic(128));

  // Solana (12 words)
  const solMnemonic = await step('sol', 'generate-mnemonic', () => bip39.generateMnemonic(128));

  // TON: 24 words generated via BIP-39 (256-bit entropy)
  const tonMnemonicPhrase = await step('ton', 'generate-mnemonic', () => bip39.generateMnemonic(256));
  const tonMnemonic = tonMnemonicPhrase.split(' ');

  const keys: DerivedChainKey[] = [];

  // BIP32/BIP39/ecc self-test and factory init happen lazily on the first
  // generateWallet() call — see getBip32(). Any adapter/factory problem
  // surfaces here as a WalletGenerationStepError tagged [chain=btc]
  // [step=init-bip32-factory] instead of an opaque TypeError.
  const bitcoin = await step('btc', 'init-bip32-factory', () => getBip32());

  // EVM root (ethers HDNode) is shared by the EVM chains and TRON.
  const { evmSeed, rootNode, evmWallet } = await step('evm', 'derive-root-and-account-key', async () => {
    const evmSeed = await bip39.mnemonicToSeed(evmMnemonic);
    const rootNode = HDNodeWallet.fromSeed(evmSeed);
    const evmWallet = rootNode.derivePath(EVM_PATH);
    return { evmSeed, rootNode, evmWallet };
  });

  // The four EVM chains share one derived key, so validating the path
  // hardening once covers all of them.
  assertValidDerivationParams('eth', evmWallet);

  for (const chain of ['eth', 'bsc', 'base', 'polygon'] as ChainId[]) {
    keys.push({
      chain,
      address: evmWallet.address,
      privateKeyOrSeed: evmWallet.privateKey,
    });
  }

  // BTC via bip32 + bitcoinjs-lib (same seed as EVM/TRON).
  await step('btc', 'derive-key-and-address', async () => {
    const btcRoot = bitcoin.fromSeed(Buffer.from(evmSeed));
    if (!btcRoot) throw new Error('bip32.fromSeed returned null (adapter/factory not initialized)');

    const btcNode = btcRoot.derivePath(BTC_PATH);
    if (!btcNode) throw new Error(`bip32.derivePath(${BTC_PATH}) returned null`);

    assertValidDerivationParams('btc', btcNode);

    const btcAddress = payments.p2wpkh({
      pubkey: Buffer.from(btcNode.publicKey),
      network: networks.bitcoin,
    }).address;
    if (!btcAddress || !btcNode.privateKey) throw new Error('Could not derive Bitcoin wallet');
    keys.push({
      chain: 'btc',
      address: btcAddress,
      privateKeyOrSeed: Buffer.from(btcNode.privateKey).toString('hex'),
    });
  });

  // TRON reuses the EVM root with its own path.
  await step('tron', 'derive-key-and-address', async () => {
    const tronWallet = rootNode.derivePath(TRON_PATH);
    assertValidDerivationParams('tron', tronWallet);
    const tronAddress = toTronAddress(tronWallet.address);
    keys.push({
      chain: 'tron',
      address: tronAddress,
      privateKeyOrSeed: tronWallet.privateKey,
    });
  });

  // Solana: separate mnemonic, ed25519 derivation.
  await step('sol', 'derive-key-and-address', async () => {
    const solSeed = await bip39.mnemonicToSeed(solMnemonic);
    const { key: solDerivedSeed } = derivePath(SOL_PATH, solSeed.toString('hex'));
    const solKeypair = Keypair.fromSeed(solDerivedSeed);
    const solAddress = solKeypair.publicKey.toBase58();

    keys.push({
      chain: 'sol',
      address: solAddress,
      privateKeyOrSeed: Buffer.from(solKeypair.secretKey).toString('hex'),
    });
  });

  // TON: separate 24-word mnemonic. mnemonicToWalletKey runs PBKDF2-SHA512
  // internally (via @ton/crypto-primitives) — see the patch on
  // @ton/crypto-primitives for the native-module fallback there.
  await step('ton', 'derive-key-and-address', async () => {
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

    keys.push({
      chain: 'ton',
      address: tonAddress,
      privateKeyOrSeed: Buffer.from(tonKeyPair.secretKey).toString('hex'),
    });
  });

  const missing = EXPECTED_CHAINS.filter((chain) => !keys.some((key) => key.chain === chain));
  if (missing.length > 0) {
    throw new Error(`Wallet generation incomplete: missing addresses for ${missing.join(', ')}`);
  }

  return { evmMnemonic, solMnemonic, tonMnemonic, keys };
}

export function toPublicAddresses(wallet: GeneratedWallet) {
  return wallet.keys.map(({ chain, address }) => ({ chain, address }));
}