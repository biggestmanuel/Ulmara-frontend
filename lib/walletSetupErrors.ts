// Formats wallet-setup failures for display on the create-account-id screen.
//
// Deliberately dependency-free: the screen that renders this must NOT import
// lib/keyGeneration (or anything that transitively pulls @ton/ton) at module
// scope, or the screen crashes before it can render. Recognition of
// WalletGenerationStepError is therefore duck-typed on its `name` and its
// `chain`/`step` fields instead of using instanceof.
//
// Only chain names, step names, and underlying error text are surfaced —
// never mnemonics or private keys (WalletGenerationStepError is constructed
// to carry nothing else).

export interface WalletErrorDisplay {
  /** One-line, user-facing summary, e.g. "Wallet setup failed at TON key derivation". */
  headline: string;
  /** Technical detail (underlying error message / HTTP status), or null. */
  detail: string | null;
}

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum',
  bsc: 'BNB Smart Chain',
  base: 'Base',
  polygon: 'Polygon',
  btc: 'Bitcoin',
  tron: 'Tron',
  sol: 'Solana',
  ton: 'TON',
};

const STEP_LABELS: Record<string, string> = {
  'generate-mnemonic': 'mnemonic generation',
  'derive-root-and-account-key': 'account key derivation',
  'init-bip32-factory': 'wallet engine initialization',
  'derive-key-and-address': 'key derivation',
  'load-key-generation-module': 'loading the wallet module',
  'persist-mnemonics': 'saving recovery phrases',
  'register-addresses': 'address registration',
  'hydrate-wallet-store': 'wallet state refresh',
};

function labelChain(chain: string): string {
  return CHAIN_LABELS[chain] ?? chain.toUpperCase();
}

function labelStep(step: string): string {
  // Strip the [httpStatus=...] suffix registerWallets appends.
  const base = step.replace(/\s*\[httpStatus=\d+\]\s*$/, '');
  return STEP_LABELS[base] ?? base.replace(/-/g, ' ');
}

function errMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return null;
}

/** WalletGenerationStepError message shape: "... [chain=X] [step=Y]: underlying" */
function parseStepErrorFields(message: string): { chain?: string; step?: string; underlying?: string } {
  const match = message.match(/\[chain=([^\]]+)\]\s*\[step=([^\]]+)\](:\s*(.*))?$/);
  if (!match) return {};
  return { chain: match[1], step: match[2], underlying: match[4] };
}

/** registerWallets fail() message shape: "Wallet setup failed [step=X]: message" */
function parseSetupFailed(message: string): { step?: string; underlying?: string } {
  const match = message.match(/Wallet setup failed \[step=([^\]]+)\]:\s*(.*)$/);
  if (!match) return {};
  return { step: match[1], underlying: match[2] };
}

export function formatWalletSetupError(err: unknown): WalletErrorDisplay {
  const fallback: WalletErrorDisplay = {
    headline: 'Something went wrong setting up your wallet.',
    detail: null,
  };
  if (!err || typeof err !== 'object') {
    return typeof err === 'string' ? { headline: err, detail: null } : fallback;
  }

  const asRecord = err as Record<string, unknown>;
  const message = errMessage(err);

  // WalletGenerationStepError (duck-typed: name + chain + step fields).
  if (asRecord.name === 'WalletGenerationStepError' && typeof asRecord.chain === 'string' && typeof asRecord.step === 'string') {
    const chain = labelChain(asRecord.chain);
    const parsed = message ? parseStepErrorFields(message) : {};
    const stepLabel = labelStep(parsed.step ?? asRecord.step);
    return {
      headline: `Wallet setup failed at ${chain} ${stepLabel}.`,
      detail: parsed.underlying ?? message ?? null,
    };
  }

  // Errors from registerWallets' fail() helper (module load, persistence,
  // address registration, store hydration).
  if (message) {
    const setup = parseSetupFailed(message);
    if (setup.step) {
      const status = setup.step.match(/\[httpStatus=(\d+)\]/)?.[1];
      const stepLabel = labelStep(setup.step);
      const detail = status ? `${setup.underlying ?? message} (HTTP ${status})` : setup.underlying ?? null;
      return { headline: `Wallet setup failed at ${stepLabel}.`, detail };
    }
  }

  // API/client errors: show the server-provided message verbatim.
  if (message) {
    return { headline: message, detail: null };
  }
  return fallback;
}
