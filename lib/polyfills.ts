import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'text-encoding';

// 1. Ensure Buffer.alloc and Buffer.from exist
if (!Buffer.alloc) {
  (Buffer as any).alloc = (size: number, fill?: any, encoding?: any) => {
    const buf = new (Buffer as any)(size);
    if (fill !== undefined) buf.fill(fill, encoding);
    return buf;
  };
}

(Buffer as any).Buffer = Buffer;

// 2. Lock Buffer onto global, globalThis, and window using Object.defineProperty
// This PREVENTS other node_modules from overwriting it with a broken Buffer stub!
const globalScopes = [
  typeof global !== 'undefined' ? global : null,
  typeof globalThis !== 'undefined' ? globalThis : null,
  typeof window !== 'undefined' ? window : null,
].filter(Boolean);

for (const scope of globalScopes) {
  if (scope) {
    try {
      Object.defineProperty(scope, 'Buffer', {
        value: Buffer,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } catch {
      (scope as any).Buffer = Buffer;
    }

    (scope as any).TextEncoder = TextEncoder;
    (scope as any).TextDecoder = TextDecoder;
  }
}

// 3. Patch require('buffer') so ANY module that requires it gets the full Buffer
try {
  const bufferPkg = require('buffer');
  if (bufferPkg) {
    bufferPkg.Buffer = Buffer;
    bufferPkg.Buffer.alloc = Buffer.alloc;
    bufferPkg.Buffer.from = Buffer.from;
    bufferPkg.Buffer.concat = Buffer.concat;
  }
} catch (e) {
  // ignore
}