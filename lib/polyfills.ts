import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'text-encoding';

// 1. Setup Buffer & Text Encoding on all global targets
const targetGlobals = [
  typeof global !== 'undefined' ? global : null,
  typeof globalThis !== 'undefined' ? globalThis : null,
  typeof window !== 'undefined' ? window : null,
].filter(Boolean);

for (const g of targetGlobals) {
  if (g) {
    (g as any).Buffer = Buffer;
    (g as any).TextEncoder = TextEncoder;
    (g as any).TextDecoder = TextDecoder;

    // Hermes safeguard: guarantee static methods exist
    if (!(g as any).Buffer.alloc) (g as any).Buffer.alloc = Buffer.alloc;
    if (!(g as any).Buffer.from) (g as any).Buffer.from = Buffer.from;
    if (!(g as any).Buffer.concat) (g as any).Buffer.concat = Buffer.concat;
  }
}

// 2. Setup crypto & crypto.randomBytes
// react-native-get-random-values polyfills getRandomValues on global.crypto.
// We must ensure globalThis.crypto and global.crypto are unified and provide randomBytes.
const resolvedCrypto = (typeof globalThis !== 'undefined' && (globalThis as any).crypto)
  ? (globalThis as any).crypto
  : (typeof global !== 'undefined' && (global as any).crypto)
  ? (global as any).crypto
  : {};

if (!resolvedCrypto.getRandomValues && (global as any).crypto?.getRandomValues) {
  resolvedCrypto.getRandomValues = (global as any).crypto.getRandomValues;
}

if (!resolvedCrypto.randomBytes) {
  resolvedCrypto.randomBytes = (size: number): Buffer => {
    const bytes = new Uint8Array(size);
    if (resolvedCrypto.getRandomValues) {
      resolvedCrypto.getRandomValues(bytes);
    } else {
      throw new Error('crypto.getRandomValues is not available');
    }
    return Buffer.from(bytes);
  };
}

for (const g of targetGlobals) {
  if (g) {
    (g as any).crypto = resolvedCrypto;
  }
}