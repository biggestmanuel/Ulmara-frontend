import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'text-encoding';

// 1. Assign Buffer and TextEncoder to all global scopes immediately
const targets = [
  typeof global !== 'undefined' ? global : null,
  typeof globalThis !== 'undefined' ? globalThis : null,
  typeof window !== 'undefined' ? window : null,
].filter(Boolean);

for (const target of targets) {
  if (target) {
    (target as any).Buffer = Buffer;
    (target as any).TextEncoder = TextEncoder;
    (target as any).TextDecoder = TextDecoder;

    // Guarantee static methods exist
    if (!(target as any).Buffer.alloc) (target as any).Buffer.alloc = Buffer.alloc;
    if (!(target as any).Buffer.from) (target as any).Buffer.from = Buffer.from;
    if (!(target as any).Buffer.concat) (target as any).Buffer.concat = Buffer.concat;
  }
}

// 2. Setup crypto.randomBytes using react-native-get-random-values
const resolvedCrypto = (globalThis as any).crypto || (global as any).crypto || {};

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

for (const target of targets) {
  if (target) {
    (target as any).crypto = resolvedCrypto;
  }
}