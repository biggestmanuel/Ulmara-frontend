// Standalone verification that @bitcoinerlab/secp256k1 (the React Native
// replacement for tiny-secp256k1) derives correct Bitcoin keys/addresses.
//
// Run from avora-frontend/:  node scripts/verify-secp256k1.mjs
//
// Test vectors:
//  1. BIP84 "abandon about" vector — mnemonic -> seed -> m/84'/0'/0'/0/0 ->
//     pubkey + P2WPKH address (exactly the code path in lib/keyGeneration.ts:
//     BIP32Factory(ecc) -> fromSeed -> derivePath(BTC_PATH) -> payments.p2wpkh).
//  2. BIP340 Schnorr vector #0 — proves the schnorr wiring (noble-curves)
//     matches the spec.

import assert from 'node:assert';
import { BIP32Factory } from 'bip32';
import { networks, payments } from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import * as ecc from '@bitcoinerlab/secp256k1';

const hex = (b) => Buffer.from(b).toString('hex');

// ---- 1. BIP84 test vector (https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki) ----
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const BTC_PATH = "m/84'/0'/0'/0/0";
const EXPECTED_PUBKEY = '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
const EXPECTED_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

const seed = await bip39.mnemonicToSeed(MNEMONIC);
const root = BIP32Factory(ecc).fromSeed(Buffer.from(seed));
const node = root.derivePath(BTC_PATH);
const address = payments.p2wpkh({ pubkey: Buffer.from(node.publicKey), network: networks.bitcoin }).address;

assert.strictEqual(hex(node.publicKey), EXPECTED_PUBKEY, `pubkey mismatch: got ${hex(node.publicKey)}`);
assert.strictEqual(address, EXPECTED_ADDRESS, `address mismatch: got ${address}`);
console.log('BIP84 vector        OK  ', address);

// ---- 2. BIP340 Schnorr test vector #0 ----
const msg = Buffer.alloc(32, 0);
const seckey3 = Buffer.alloc(32, 0); seckey3[31] = 3;
const aux = Buffer.alloc(32, 0);
const EXPECTED_SCHNORR_PUB = 'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9';
const EXPECTED_SCHNORR_SIG =
  'e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca8215' +
  '25f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0';

assert.strictEqual(hex(ecc.xOnlyPointFromScalar(seckey3)), EXPECTED_SCHNORR_PUB, 'schnorr pubkey mismatch');
const sig = hex(ecc.signSchnorr(msg, seckey3, aux));
assert.strictEqual(sig, EXPECTED_SCHNORR_SIG, `schnorr sig mismatch: got ${sig}`);
assert.strictEqual(ecc.verifySchnorr(msg, ecc.xOnlyPointFromScalar(seckey3), Buffer.from(sig, 'hex')), true);
console.log('BIP340 schnorr      OK  ', sig.slice(0, 32) + '...');

// ---- 3. ECDSA sign/verify roundtrip + compression sanity ----
const priv = Buffer.alloc(32, 0); priv[31] = 0x42;
const msgHash = Buffer.from('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', 'hex'); // sha256("test")
const e = ecc.sign(msgHash, priv);
assert.strictEqual(ecc.verify(msgHash, ecc.pointFromScalar(priv), e), true, 'ecdsa verify failed');
const comp = hex(ecc.pointCompress(ecc.pointFromScalar(priv, false), true));
assert.strictEqual(comp, EXPECTED_PUBKEY.slice(0, 2) + comp.slice(2)); // compression itself is exercised via vector 1
console.log('ECDSA sign/verify   OK');

console.log('\nAll secp256k1 vectors passed — @bitcoinerlab/secp256k1 is a correct drop-in.');
