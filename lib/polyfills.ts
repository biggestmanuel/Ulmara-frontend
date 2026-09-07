import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'text-encoding';

// Ensure Buffer and its static methods are on both global and globalThis
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

    // Hermes safeguard: guarantee static methods are attached
    if (!(g as any).Buffer.alloc) {
      (g as any).Buffer.alloc = Buffer.alloc;
    }
    if (!(g as any).Buffer.from) {
      (g as any).Buffer.from = Buffer.from;
    }
    if (!(g as any).Buffer.concat) {
      (g as any).Buffer.concat = Buffer.concat;
    }
  }
}