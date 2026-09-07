import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'text-encoding';

// 1. Ensure Buffer.alloc, from, concat, and self-referencing Buffer exist
(Buffer as any).Buffer = Buffer;

if (!Buffer.alloc) {
  (Buffer as any).alloc = (size: number, fill?: any, encoding?: any) => {
    const buf = new (Buffer as any)(size);
    if (fill !== undefined) buf.fill(fill, encoding);
    return buf;
  };
}

// 2. CRITICAL HERMES FIX: Polyfill .copy on Uint8Array and Buffer
// In Hermes, functions in @ton/core return Uint8Arrays and call .copy(),
// which Node's Buffer has, but standard Uint8Array lacks.
const copyImpl = function (
  this: Uint8Array,
  target: Uint8Array,
  targetStart = 0,
  sourceStart = 0,
  sourceEnd = this.length
) {
  const sub = this.subarray(sourceStart, sourceEnd);
  target.set(sub, targetStart);
  return sub.length;
};

if (!(Uint8Array.prototype as any).copy) {
  (Uint8Array.prototype as any).copy = copyImpl;
}
if (!(Buffer.prototype as any).copy) {
  (Buffer.prototype as any).copy = copyImpl;
}

// 3. Attach to all global targets
const globalScopes = [
  typeof global !== 'undefined' ? global : null,
  typeof globalThis !== 'undefined' ? globalThis : null,
  typeof window !== 'undefined' ? window : null,
].filter(Boolean);

for (const scope of globalScopes) {
  if (scope) {
    (scope as any).Buffer = Buffer;
    (scope as any).TextEncoder = TextEncoder;
    (scope as any).TextDecoder = TextDecoder;

    if (!(scope as any).Buffer.alloc) (scope as any).Buffer.alloc = Buffer.alloc;
    if (!(scope as any).Buffer.from) (scope as any).Buffer.from = Buffer.from;
    if (!(scope as any).Buffer.concat) (scope as any).Buffer.concat = Buffer.concat;
    (scope as any).Buffer.Buffer = Buffer;
  }
}

// 4. Setup crypto.randomBytes
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

for (const scope of globalScopes) {
  if (scope) {
    (scope as any).crypto = resolvedCrypto;
  }
}