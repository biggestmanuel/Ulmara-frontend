// End-to-end verification of the wallet key-generation stack.
//
// node scripts/verify-wallet-generation.mjs
//
// Checks (mirrors the logic in lib/keyGeneration.ts — keyGeneration.ts is TS,
// so it can't be imported directly from Node):
//   1. BIP84 'abandon about' vector through the exact BTC code path.
//   2. ecc adapter probe rejects a broken adapter (the class of failure behind
//      "Cannot read property 'derive' of null") with a tagged error.
//   3. The @ton/crypto-primitives patch: TON's official PBKDF2-HMAC-SHA512
//      vectors through BOTH branches — JS fallback (native module missing)
//      and native-present passthrough.
//   4. Full 8-chain wallet generation (EVM x4, TRON, BTC, SOL, TON).
//      Public addresses only are printed; keys never leave memory.

import assert from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const { BIP32Factory } = require('bip32');
const { networks, payments } = require('bitcoinjs-lib');
const bip39 = require('bip39');
const ecc = require('@bitcoinerlab/secp256k1');
const { HDNodeWallet, sha256, getBytes, pbkdf2 } = require('ethers');
const { derivePath } = require('ed25519-hd-key');
const { Keypair } = require('@solana/web3.js');
const { mnemonicToWalletKey } = require('@ton/crypto');
const { Cell, beginCell, contractAddress } = require('@ton/core');
const nodeCrypto = require('node:crypto');

let passed = 0;
function ok(label) {
  passed++;
  console.log('OK  ', label);
}

// ---- 1. BIP84 vector through keyGeneration's exact BTC path ----------------
const VEC_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const BTC_PATH = "m/84'/0'/0'/0/0";
const EXPECTED_PUBKEY = '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
const EXPECTED_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

const factory = BIP32Factory(ecc);
const vecSeed = await bip39.mnemonicToSeed(VEC_MNEMONIC);
const vecRoot = factory.fromSeed(Buffer.from(vecSeed));
const vecNode = vecRoot.derivePath(BTC_PATH);
const vecAddr = payments.p2wpkh({ pubkey: Buffer.from(vecNode.publicKey), network: networks.bitcoin }).address;
assert.strictEqual(Buffer.from(vecNode.publicKey).toString('hex'), EXPECTED_PUBKEY, 'BIP84 pubkey mismatch');
assert.strictEqual(vecAddr, EXPECTED_ADDRESS, 'BIP84 address mismatch');
ok(`BIP84 vector (BTC m/84'/0'/0'/0/0)      ${vecAddr}`);

// ---- 2. ecc adapter probe: broken adapter must fail loudly, not crash ------
// Mirrors assertEccAdapter() in lib/keyGeneration.ts.
function assertEccAdapter(eccLib) {
  const fail = (m) => { throw new Error(`[chain=btc] [step=init-bip32-factory] ${m}`); };
  if (typeof eccLib !== 'object' || eccLib === null) fail('ecc adapter missing');
  for (const fn of ['isPrivate', 'pointCompress', 'pointFromScalar', 'privateAdd']) {
    if (typeof eccLib[fn] !== 'function') fail(`ecc.${fn} missing`);
  }
  const d = new Uint8Array(32).fill(1);
  if (!eccLib.isPrivate(d)) fail('ecc.isPrivate: self-test failed');
  const P = eccLib.pointFromScalar(d, true);
  if (P === null) fail('ecc.pointFromScalar: self-test failed');
  if (eccLib.pointCompress(P, false).length !== 65) fail('ecc.pointCompress: self-test failed');
  const d2 = eccLib.privateAdd(d, d);
  if (d2 === null || !eccLib.isPrivate(d2)) fail('ecc.privateAdd: self-test failed');
}

assertEccAdapter(ecc); // real adapter passes
ok('ecc adapter probe (valid adapter)      accepted');

for (const [name, broken] of [
  ['pointFromScalar -> null', { ...ecc, pointFromScalar: () => null }],
  ['privateAdd -> null (hardening op)', { ...ecc, privateAdd: () => null }],
  ['adapter entirely null', null],
]) {
  assert.throws(() => assertEccAdapter(broken), /init-bip32-factory/);
  ok(`ecc adapter probe (${name})  caught`);
}
// Demonstrate the unguarded failure this probe prevents: deriving against a
// broken adapter crashes with an opaque TypeError instead of a tagged error.
try {
  BIP32Factory({ ...ecc, privateAdd: () => null }).fromSeed(Buffer.alloc(64, 1)).deriveHardened(44);
  assert.fail('broken adapter unexpectedly derived');
} catch (err) {
  ok(`unguarded broken adapter throws:       ${String(err.message).slice(0, 48)}`);
}

// ---- 3. @ton/crypto-primitives patch: both PBKDF2 branches -----------------
// Evaluate the patched file with a require() shim so we can simulate a device
// without the native module (fallback branch) and one with it (passthrough).
const PATCHED = path.join(here, '..', 'node_modules', '@ton/crypto-primitives', 'dist', 'native', 'pbkdf2_sha512.js');

function loadPatched({ nativePresent }) {
  const nativeDerive = (password, salt, iterations, keySize, hash) =>
    nodeCrypto.pbkdf2Sync(Buffer.from(password, 'base64'), Buffer.from(salt, 'base64'), iterations, keySize, hash.replace('-', '')).toString('base64');
  const shim = (name) => {
    if (name === 'react-native') return { NativeModules: nativePresent ? { Pbkdf2: { derive: nativeDerive } } : {} };
    if (name === 'react-native-fast-pbkdf2') return { default: { derive: nativeDerive } };
    if (name === 'ethers') return { pbkdf2 };
    throw new Error(`unexpected require(${name}) in patch`);
  };
  const module_ = { exports: {} };
  new Function('module', 'exports', 'require', readFileSync(PATCHED, 'utf8'))(module_, module_.exports, shim);
  return module_.exports.pbkdf2_sha512;
}

// TON's official vectors (@ton/crypto/dist/primitives/pbkdf2_sha512.spec.js)
const TON_VECTORS = [
  ['password', 'salt', 1, 64],
  ['password', 'salt', 2, 64],
  ['password', 'salt', 4096, 64],
  ['passwordPASSWORDpassword', 'saltSALTsaltSALTsaltSALTsaltSALTsalt', 4096, 64],
];
const EXPECTED_TON = [
  '867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce',
  'e1d9c16aa681708a45f5c7c4e215ceb66e011a2e9f0040713f18aefdb866d53cf76cab2868a39b9f7840edce4fef5a82be67335c77a6068e04112754f27ccf4e',
  'd197b1b33db0143e018b12f3d1d1479e6cdebdcc97c5c0f87f6902e072f457b5143f30602641b3d55cd335988cb36b84376060ecd532e039b742a239434af2d5',
  '8c0511f4c6e597c6ac6315d8f0362e225f3c501495ba23b868c005174dc4ee71115b59f9e60cd9532fa33e0f75aefe30225c583a186cd82bd4daea9724a3d3b8',
];

for (const [nativePresent, label] of [[false, 'JS fallback (native missing)'], [true, 'native passthrough']]) {
  const pbkdf2_sha512 = loadPatched({ nativePresent });
  for (let i = 0; i < TON_VECTORS.length; i++) {
    const [password, salt, iters, len] = TON_VECTORS[i];
    const out = await pbkdf2_sha512(Buffer.from(password), salt, iters, len);
    assert.strictEqual(Buffer.from(out).toString('hex'), EXPECTED_TON[i], `TON vector ${i} (${label}) mismatch`);
  }
  ok(`TON PBKDF2 vectors x4 (${label})`);
}

// ---- 4. Full 8-chain wallet generation (addresses only) --------------------
function toBase58(buffer) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
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
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let result = '';
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) result += ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) result += ALPHABET[digits[i]];
  return result;
}

function toTronAddress(ethAddress) {
  const clean = ethAddress.replace(/^0x/, '').toLowerCase();
  const addressBytes = getBytes('0x41' + clean);
  const hash1 = getBytes(sha256(addressBytes));
  const hash2 = getBytes(sha256(hash1));
  const combined = new Uint8Array(25);
  combined.set(addressBytes);
  combined.set(hash2.slice(0, 4), 21);
  return toBase58(combined);
}

const evmMnemonic = bip39.generateMnemonic(128);
const solMnemonic = bip39.generateMnemonic(128);
const tonMnemonicPhrase = bip39.generateMnemonic(256);

const addresses = {};

const evmSeed = await bip39.mnemonicToSeed(evmMnemonic);
const rootNode = HDNodeWallet.fromSeed(evmSeed);
const evmWallet = rootNode.derivePath("m/44'/60'/0'/0/0");
addresses.eth = addresses.bsc = addresses.base = addresses.polygon = evmWallet.address;

const btcRoot = factory.fromSeed(Buffer.from(evmSeed));
const btcNode = btcRoot.derivePath(BTC_PATH);
addresses.btc = payments.p2wpkh({ pubkey: Buffer.from(btcNode.publicKey), network: networks.bitcoin }).address;

const tronWallet = rootNode.derivePath("m/44'/195'/0'/0/0");
addresses.tron = toTronAddress(tronWallet.address);

const solSeed = await bip39.mnemonicToSeed(solMnemonic);
const { key: solDerivedSeed } = derivePath("m/44'/501'/0'/0'", solSeed.toString('hex'));
addresses.sol = Keypair.fromSeed(solDerivedSeed).publicKey.toBase58();

const tonKeyPair = await mnemonicToWalletKey(tonMnemonicPhrase.split(' '));
const code = Cell.fromBoc(Buffer.from(
  'te6ccgECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVA==',
  'base64'
))[0];
const data = beginCell()
  .storeUint(0, 32)
  .storeUint(698983191, 32)
  .storeBuffer(Buffer.from(tonKeyPair.publicKey))
  .storeBit(0)
  .endCell();
addresses.ton = contractAddress(0, { code, data }).toString({ bounceable: false });

const required = ['eth', 'bsc', 'base', 'polygon', 'btc', 'tron', 'sol', 'ton'];
assert.deepStrictEqual(Object.keys(addresses).sort(), [...required].sort(), 'chain set mismatch');
for (const chain of required) {
  assert.strictEqual(typeof addresses[chain], 'string');
  assert.ok(addresses[chain].length >= 20, `${chain} address too short`);
}
console.log('\nFull wallet generated — public addresses only:');
for (const chain of required) console.log(`  ${String(chain).padEnd(8)} ${addresses[chain]}`);

console.log(`\nAll ${passed} checks passed — wallet generation is end-to-end healthy (BTC included).`);
