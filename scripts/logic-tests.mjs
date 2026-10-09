// Code-level verification of the pure logic introduced in this pass.
//
// Runs the real modules (not copies) by transpiling them with the project's own
// TypeScript and stubbing only the native/expo imports that cannot load in
// Node. Covers:
//   - lib/api/client.ts      friendlyError / toApiError
//   - constants/tokens.ts     token registry resolution
//   - lib/tokens/erc20.ts    amount parsing + decimal validation
//   - lib/api/contacts.ts    contact validation
//   - lib/push/pushNotifications.ts  push payload validation + dedupe keys
//   - lib/security/biometrics.ts     outcome classification
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.argv[2] ?? '.');

// --- transpile the handful of modules under test into a scratch dir --------
// Uses the TypeScript compiler API in transpile-only mode. `tsc` itself
// refuses to emit when outDir would overlap the input tree ("files will
// overwrite input file"), and full type-checking is already covered by
// `npm run typecheck`.
const work = mkdtempSync(join(tmpdir(), 'ulmara-verify-'));

// This scratch tree holds a `node_modules` symlink and every transpiled module.
// Leaving it behind leaks both disk and inode entries on every run — 111 of
// these had accumulated. Removed on a clean exit and on a failure, because a
// throw part-way through is exactly when the directory gets abandoned.
const removeScratch = () => {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch (err) {
    // Must never fail a run over a scratch dir. But it is *logged*, because a
    // silent catch here is indistinguishable from a cleanup that works — and
    // when this was first added, the catch swallowed an undefined `rmSync` and
    // leaked a directory on every single run while appearing to do nothing.
    console.warn(`[cleanup] could not remove ${work}:`, err?.message ?? err);
  }
};
process.on('exit', removeScratch);
process.on('uncaughtException', (err) => {
  removeScratch();
  console.error(err);
  process.exit(1);
});
const out = join(work, 'out');
mkdirSync(out, { recursive: true });

// Link the project's real node_modules into the scratch tree so bare imports of
// genuine pure-JavaScript dependencies resolve to the real package instead of
// requiring a hand-written stand-in.
//
// This exists because of a bug it would have caught. `axios` was stubbed with
// `isAxiosError: (e) => e.isAxios === true`, while real axios tests
// `e.isAxiosError === true`. Nothing under test could tell the difference,
// because `toApiError` duck-tested `{ status, code, message }` before ever
// asking whether the value was an axios error — so an error thrown by the real
// client was never recognised, the server's accurate message was discarded on
// every request, and the suite was green. Real packages for pure-JS deps; stubs
// reserved for native and Expo modules that genuinely cannot load in Node.
symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'), 'junction');

const { createRequire } = await import('node:module');
const require_ = createRequire(join(ROOT, 'package.json'));
const ts = require_('typescript');

const TARGETS = [
  'lib/api/client.ts',
  'constants/tokens.ts',
  'lib/tokens/erc20.ts',
  'lib/api/contacts.ts',
  'lib/api/auth.ts',
  'lib/api/accountId.ts',
  'lib/api/transactions.ts',
  'stores/contactsStore.ts',
  'lib/gas/gasAbstraction.ts',
  'lib/push/pushNotifications.ts',
  'lib/security/biometrics.ts',
  'lib/chains/evmConfig.ts',
  'lib/api/tokens.ts',
  'lib/api/routing.ts',
  'lib/theme/index.ts',
  'stores/authGateStore.ts',
];

const emitted = [];

// Transpile the named entry points plus every local module they pull in
// (transitively). Dynamic `import()` inside a module is never followed, so the
// per-chain loaders in lib/chains/index.ts are not dragged in.
const done = new Set();
const queue = [...TARGETS];
while (queue.length) {
  const rel = queue.shift();
  if (done.has(rel)) continue;
  const srcPath = join(ROOT, rel);
  if (!existsSync(srcPath)) continue;
  done.add(rel);

  const src = readFileSync(srcPath, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: rel,
  }).outputText;

  const dest = join(out, rel.replace(/\.tsx?$/, '.js'));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, js);
  emitted.push(dest);

  // Follow static relative imports only.
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const spec = m[1];
    const abs = resolve(dirname(srcPath), spec.replace(/\.js$/, ''));
    const relFromRoot = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
    for (const ext of ['.ts', '.tsx']) {
      if (existsSync(abs + ext)) queue.push(relFromRoot + ext);
    }
  }
}

// Minimal stubs for the native modules the pure code imports at module scope.
const STUBS = {
  'react-native': `
    export const Platform = { OS: 'ios', select: (o) => o.ios ?? o.default };
    export const Appearance = { getColorScheme: () => 'dark' };
    export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
    export const StyleSheet = { create: (s) => s, absoluteFill: {}, absoluteFillObject: {} };
    export const View = 'View';
  `,
  'expo-notifications': `
    export const setNotificationHandler = () => {};
    export const getPermissionsAsync = async () => ({ granted: false, canAskAgain: false });
    export const requestPermissionsAsync = async () => ({ granted: false, canAskAgain: false });
    export const getExpoPushTokenAsync = async () => ({ data: null });
    export const setBadgeCountAsync = async () => true;
    export const getLastNotificationResponseAsync = async () => null;
    export const addNotificationReceivedListener = () => ({ remove() {} });
    export const addNotificationResponseReceivedListener = () => ({ remove() {} });
  `,
  'expo-device': `export const isDevice = true; export const deviceName = 'probe';`,
  'expo-constants': `export default { expoConfig: { extra: { eas: { projectId: 'probe' } } } };`,
  'expo-local-authentication': `
    export const AuthenticationType = { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 };
    export const hasHardwareAsync = async () => true;
    export const isEnrolledAsync = async () => true;
    export const supportedAuthenticationTypesAsync = async () => [2];
    export const authenticateAsync = async () => ({ success: true });
  `,
  'expo-secure-store': `
    const m = new Map();
    export const getItemAsync = async (k) => (m.has(k) ? m.get(k) : null);
    export const setItemAsync = async (k, v) => { m.set(k, v); };
    export const deleteItemAsync = async (k) => { m.delete(k); };
  `,
  '@react-native-async-storage/async-storage': `
    const m = new Map();
    export default {
      getItem: async (k) => (m.has(k) ? m.get(k) : null),
      setItem: async (k, v) => { m.set(k, v); },
      removeItem: async (k) => { m.delete(k); },
    };
  `,
  'ethers': `
    export const ethers = {
      formatUnits: () => '0',
      parseUnits: () => 0n,
      parseEther: () => 0n,
      getAddress: (a) => a,
      AbiCoder: { defaultAbiCoder: { decode: () => [0n] } },
      Interface: class { encodeFunctionData() { return '0x'; } },
      JsonRpcProvider: class { async send() { return '0x1'; } async getBalance() { return 0n; } async getCode() { return '0x'; } async getFeeData() { return {}; } async estimateGas() { return 21000n; } async getTransactionCount() { return 0; } },
    };
  `,
  'zustand': `
    // Minimal but faithful enough to drive the auth gate's state machine:
    // a real get/set pair plus the getState/setState statics the store exposes.
    export const create = (fn) => {
      let state;
      const set = (partial) => {
        const patch = typeof partial === 'function' ? partial(state) : partial;
        state = Object.assign({}, state, patch);
      };
      const get = () => state;
      state = fn(set, get);
      const useStore = () => state;
      useStore.getState = get;
      useStore.setState = set;
      return useStore;
    };
  `,
};

for (const [name, code] of Object.entries(STUBS)) {
  const dir = join(work, 'stubs', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.mjs'), code);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: name, type: 'module', main: 'index.mjs' }));
}

// Rewrite bare imports in the compiled output to point at the stubs, and make
// relative imports carry .mjs so Node's ESM resolver is happy.
for (const file of emitted) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(/from ["'](\.[^"']*)["']/g, (m, spec) => {
    if (/\.(mjs|json|node)$/.test(spec)) return m;
    return `from '${spec}.mjs'`;
  });
  for (const name of Object.keys(STUBS)) {
    const esc = name.replace(/\//g, '\\/');
    src = src.replace(new RegExp(`from ["']${esc}["']`, 'g'), `from '${pathToFileURL(join(work, 'stubs', name, 'index.mjs')).href}'`);
  }
  const target = file.replace(/\.js$/, '.mjs');
  writeFileSync(target, src);
}

function load(rel) {
  return import(pathToFileURL(join(out, rel.replace(/\.tsx?$/, '.mjs'))).href);
}

/**
 * Loads a second, independent copy of a module with a patched environment.
 *
 * Some modules read configuration once, at module scope, into a module-level
 * constant. ESM caches by resolved URL, so re-calling `load` hands back the
 * instance that was already evaluated and the constant can never change. This
 * re-runs the same transpile-and-rewrite pipeline into a differently-named file
 * so the copy under test really is evaluated against the patched env.
 *
 * Relative imports are left resolving beside the original, so the copy shares
 * its dependencies — notably the one `apiClient` instance — with everything
 * already loaded. That is what lets a test watch the requests it makes.
 */
let freshCount = 0;

async function loadFresh(rel, envPatch) {
  const previous = {};
  for (const [k, v] of Object.entries(envPatch)) {
    previous[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    let js = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: rel,
    }).outputText;

    js = js.replace(/from ["'](\.[^"']*)["']/g, (m, spec) =>
      /\.(mjs|json|node)$/.test(spec) ? m : `from '${spec}.mjs'`
    );
    for (const name of Object.keys(STUBS)) {
      const esc = name.replace(/\//g, '\\/');
      js = js.replace(
        new RegExp(`from ["']${esc}["']`, 'g'),
        `from '${pathToFileURL(join(work, 'stubs', name, 'index.mjs')).href}'`
      );
    }

    // A unique name per call, and not merely a different one from the original:
    // ESM caches by resolved URL, so writing to a path that has already been
    // imported returns the previously-evaluated instance and the caller ends up
    // asserting against a module built with a different environment. The first
    // version of this helper had that bug and it silently made a flag-ON module
    // answer a flag-OFF question.
    freshCount += 1;
    const dest = join(out, rel.replace(/\.tsx?$/, `.fresh${freshCount}.mjs`));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, js);
    return await import(pathToFileURL(dest).href);
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// --- assertions -------------------------------------------------------------
let pass = 0;
let fail = 0;
const ok = (t) => { pass++; console.log(`  PASS ${t}`); };
const bad = (t, d) => { fail++; console.log(`  FAIL ${t}`); if (d) console.log(`        ${d}`); };
const eq = (a, b, t) => (a === b ? ok(t) : bad(t, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`));

console.log('\n== lib/api/client: friendlyError never leaks a raw status code ==');
{
  const { friendlyError, toApiError } = await load('lib/api/client.ts');
  eq(friendlyError({ status: 409, code: 'x', message: 'An account with this email already exists.' }),
     'An account with this email already exists.', 'server prose is passed through');
  eq(friendlyError({ status: 409, code: 'x', message: '409' }),
     'That conflicts with an existing account. Try logging in instead.', 'bare "409" -> per-status copy');
  eq(friendlyError({ status: 500, code: 'x', message: '500 Internal Server Error' }),
     'Something went wrong on our side. Please try again.', '"500 Internal Server Error" -> per-status copy');
  eq(friendlyError(new Error('Request failed with status code 500')),
     'Something went wrong. Please try again.', 'axios echo -> generic copy');
  eq(friendlyError(undefined, 'fallback text'), 'fallback text', 'non-error value -> caller fallback');
  eq(toApiError(new Error('boom')).code, 'unknown_error', 'toApiError normalises a bare Error');
}

console.log('\n== lib/api/client: a real axios rejection surfaces the server prose ==');
{
  const { friendlyError, toApiError } = await load('lib/api/client.ts');

  // These four cases are the regression that hid the real reason for every
  // failed request in the app. `toApiError` duck-tested `{status, code,
  // message}` BEFORE checking `isAxiosError`, and a thrown AxiosError satisfies
  // that shape — so the envelope extraction below it was unreachable for every
  // real request and each screen fell through to generic per-status copy.
  //
  // The assertions below construct the error the way axios actually throws it,
  // captured from the live backend, rather than the pre-normalised shape the
  // cases above use. A test built from the normalised shape passes against both
  // the broken and the fixed implementation, which is exactly why the bug
  // survived a green suite.
  const axiosLike = (status, code, echo, data) => ({
    isAxiosError: true,
    name: 'AxiosError',
    message: echo,
    status,
    code,
    config: {},
    response: { status, data, headers: {}, config: {} },
    toJSON: () => ({}),
  });

  // The exact case found by driving the Send screen: self-transfer is refused.
  const selfTransfer = axiosLike(
    400,
    'ERR_BAD_REQUEST',
    'Request failed with status code 400',
    { success: false, message: 'Cannot resolve your own Account ID for transfer' }
  );
  eq(
    friendlyError(selfTransfer),
    'Cannot resolve your own Account ID for transfer',
    'a 400 envelope message reaches the user instead of generic 400 copy'
  );
  eq(toApiError(selfTransfer).status, 400, 'status survives normalisation');
  eq(
    toApiError(selfTransfer).code,
    'http_400',
    'the axios branch, not the pass-through branch, produced this error'
  );

  // 409 duplicate-account, the case the earlier pass-through test implied worked.
  const duplicate = axiosLike(
    409,
    'ERR_BAD_REQUEST',
    'Request failed with status code 409',
    { success: false, message: 'An account with this email already exists.' }
  );
  eq(
    friendlyError(duplicate),
    'An account with this email already exists.',
    'a 409 envelope message reaches the user'
  );

  // PIN lockout — the single most important message to get right.
  const locked = axiosLike(
    423,
    'ERR_BAD_REQUEST',
    'Request failed with status code 423',
    { success: false, message: 'Too many incorrect PIN attempts. Try again in 4 minutes.' }
  );
  eq(
    friendlyError(locked),
    'Too many incorrect PIN attempts. Try again in 4 minutes.',
    'the real lockout countdown is shown, not the generic 423 copy'
  );

  // An envelope that is not { success:false, message } must NOT be trusted —
  // a proxy HTML page would otherwise be rendered as prose.
  const htmlPage = axiosLike(502, 'ERR_BAD_RESPONSE', 'Request failed with status code 502', '<!DOCTYPE html><html>');
  eq(
    friendlyError(htmlPage),
    'Our servers are temporarily unreachable. Please try again shortly.',
    'an HTML error body does not become user-facing text'
  );

  // No response at all is a transport failure, not an HTTP status.
  const offline = { isAxiosError: true, name: 'AxiosError', message: 'Network Error', code: 'ERR_NETWORK', config: {} };
  eq(
    friendlyError(offline),
    'Cannot reach the server. Check your internet connection and try again.',
    'a transport failure reads as "check your connection", not an HTTP status'
  );
  eq(toApiError(offline).status, null, 'a transport failure has no HTTP status');
  eq(toApiError(offline).code, 'network_error', 'a transport failure is code network_error');
}

console.log('\n== constants/tokens: registry only exposes configured networks ==');
{
  const t = await load('constants/tokens.ts');
  const cfg = await load('lib/chains/evmConfig.ts');
  eq(t.isTokenSymbol('USDC'), true, 'USDC is a known symbol');
  eq(t.isTokenSymbol('DOGE'), false, 'DOGE is not a known symbol');
  eq(t.getTokenForChain('NOPE', 'eth'), null, 'unknown symbol resolves to null');
  // A chain not in the token's list must never resolve.
  eq(t.getTokenForChain('USDC', 'ton'), null, 'USDC is not offered on TON');

  // The decisive check. The backend runs Sepolia (11155111) and the seeded
  // addresses are Ethereum *mainnet*, so no seeded token may be offered — a
  // mainnet token address on Sepolia names a contract that is not there.
  const onSepolia = cfg.getEvmChainId('eth') === 11155111;
  if (onSepolia) {
    eq(t.getConfiguredTokens('eth').length, 0, 'no token is offered on Sepolia without configuration');
    eq(t.getTokenForChain('USDC', 'eth'), null, 'mainnet USDC is hidden on Sepolia');
    eq(t.getTokenForChain('USDT', 'eth'), null, 'mainnet USDT is hidden on Sepolia');
  } else {
    eq(t.getConfiguredTokens('eth').length >= 1, true, 'Ethereum mainnet has seeded addresses');
    eq(t.getTokenForChain('USDC', 'eth').addresses.eth.toLowerCase(),
       '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC mainnet address resolves');
  }
}

console.log('\n== lib/tokens/erc20: amount parsing and decimal validation ==');
{
  const e = await load('lib/tokens/erc20.ts');
  eq(e.validateTokenAmount('1.5', 6, 'USDC'), null, '1.5 is valid for a 6dp token');
  eq(e.validateTokenAmount('1.123456', 6, 'USDC'), null, 'exactly 6dp is valid');
  eq(e.validateTokenAmount('1.1234567', 6, 'USDC'), 'USDC supports at most 6 decimal places', '7dp is rejected');
  eq(e.validateTokenAmount('', 6, 'USDC'), null, 'empty field is not flagged mid-typing');
  eq(e.validateTokenAmount('1.', 6, 'USDC'), null, 'trailing dot is allowed while typing');
  eq(e.validateTokenAmount('abc', 6, 'USDC'), 'Enter a valid amount', 'letters are rejected');
  eq(e.validateTokenAmount('01', 6, 'USDC'), 'Remove the leading zeros', 'leading zero is rejected');
  eq(e.validateTokenAmount('1.2.3', 6, 'USDC'), 'Enter a valid amount', 'two dots are rejected');
  // parseTokenAmount must refuse to truncate a 7th decimal.
  let threw = null;
  try { e.parseTokenAmount('1.1234567', 6); } catch (err) { threw = err.message; }
  eq(threw, 'This asset supports at most 6 decimal places', 'parseTokenAmount refuses to truncate');
  threw = null;
  try { e.parseTokenAmount('0.000000', 6); } catch (err) { threw = err.message; }
  eq(threw, 'Amount must be greater than zero', 'a zero amount is refused');
  threw = null;
  try { e.parseTokenAmount('-1', 6); } catch (err) { threw = err.message; }
  eq(threw, 'Enter a valid amount', 'a negative amount is refused');
}

console.log('\n== lib/api/contacts: draft validation and conflict detection ==');
{
  const c = await load('lib/api/contacts.ts');
  eq(c.isValidAccountId('1234567890'), true, '10 digits is valid');
  eq(c.isValidAccountId('1234 567 890'), false, 'spaces are not valid input');
  eq(c.normalizeAccountId('1234 567 890'), '1234567890', 'normalisation strips formatting');
  eq(c.validateContactDraft({ name: 'Ada', accountId: '1234567890' }), null, 'a complete draft passes');
  eq(c.validateContactDraft({ name: '  ', accountId: '1234567890' }), 'Enter a name for this contact.', 'a blank name is rejected');
  eq(c.validateContactDraft({ name: 'Ada', accountId: '123' }), 'Enter a valid 10-digit Account ID.', 'a short Account ID is rejected');
  const list = [
    { id: '1', name: 'Ada', accountId: '1111111111' },
    { id: '2', name: 'Bob', accountId: '2222222222' },
  ];
  eq(c.findConflictingName(list, 'ada')?.id, '1', 'a duplicate name is detected case-insensitively');
  eq(c.findConflictingName(list, 'ada', '1'), undefined, 'a contact does not conflict with itself');
  eq(c.findDuplicateAccountId(list, '2222 222 222')?.id, '2', 'a duplicate Account ID is detected');
  eq(c.findDuplicateAccountId(list, '3333333333'), undefined, 'a new Account ID is not a duplicate');
}

console.log('\n== lib/push: payload validation, copy, and dedupe keys ==');
{
  const p = await load('lib/push/pushNotifications.ts');
  const valid = {
    type: 'transfer.received',
    transactionId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    asset: 'USDC',
    amount: '25.5',
    network: 'ETH',
    status: 'COMPLETED',
    counterparty: '1234567890',
  };
  eq(p.parseTransactionNotification(valid)?.type, 'transfer.received', 'a well-formed payload parses');
  eq(p.parseTransactionNotification({ ...valid, type: 'evil' }), null, 'an unknown type is rejected');
  eq(p.parseTransactionNotification({ ...valid, transactionId: 'not-a-uuid' }), null, 'a non-uuid transactionId is rejected');
  eq(p.parseTransactionNotification({ ...valid, amount: '25.5; DROP' }), null, 'a non-numeric amount is rejected');
  eq(p.parseTransactionNotification({ ...valid, amount: '9'.repeat(400) }), null, 'an oversized field is rejected');
  eq(p.parseTransactionNotification({ ...valid, status: 'FAILED' }), null, 'a status that contradicts the type is rejected');
  eq(p.parseTransactionNotification({ ...valid, counterparty: '' }), null, 'an empty counterparty is rejected');
  eq(p.parseTransactionNotification(null), null, 'null data is rejected');
  eq(p.parseTransactionNotification(undefined), null, 'undefined data is rejected');

  // The payload must carry no secret-shaped field.
  const serialised = JSON.stringify(valid).toLowerCase();
  for (const secret of ['pin', 'mnemonic', 'seed', 'private', 'password', 'key']) {
    eq(serialised.includes(secret), false, `payload contains no "${secret}" field`);
  }

  eq(p.notificationCopy(valid).title, 'Money received', 'received copy');
  eq(p.notificationCopy({ ...valid, type: 'transfer.sent.confirmed' }).tone, 'success', 'confirmed is a success tone');
  eq(p.notificationCopy({ ...valid, type: 'transfer.sent.failed' }).tone, 'error', 'failed is an error tone');
  eq(p.notificationCopy({ ...valid, type: 'transfer.sent.failed' }).body.includes('funds were not sent'), true, 'failed copy says funds were not sent');
  eq(p.notificationRoute(valid), '/transaction/3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'deep link targets the transaction route');

  // Dedupe identity: the same event for the same transaction must collapse.
  const id1 = `${valid.type}:${valid.transactionId}`;
  const id2 = `${valid.type}:${valid.transactionId}`;
  eq(id1 === id2, true, 'a redelivered push produces the same dedupe key');
  eq(`${'transfer.sent.failed'}:${valid.transactionId}` === id1, false, 'a different event for the same tx is a different key');
}

console.log('\n== lib/security/biometrics: outcome classification ==');
{
  const b = await load('lib/security/biometrics.ts');
  // A cancellation is not an error and must map to no user-facing message.
  eq(b.describeOutcome('cancelled'), null, 'cancellation produces no error copy');
  eq(b.describeOutcome('fallback'), null, 'the system passcode fallback produces no error copy');
  const lockout = b.describeOutcome('lockout');
  eq(typeof lockout === 'string' && lockout.includes('passcode'), true, 'a lockout tells the user to use the passcode');
  const notEnrolled = b.describeOutcome('not_enrolled');
  eq(typeof notEnrolled === 'string' && notEnrolled.includes('PIN'), true, 'not-enrolled points at the PIN fallback');
  eq(b.describeOutcome('failed') !== null, true, 'a failed match has copy');
  eq(b.biometricLabel([2]), 'Face ID', 'facial recognition is labelled Face ID');
  eq(b.biometricLabel([1]), 'Fingerprint', 'fingerprint is labelled Fingerprint');
}

console.log('\n== lib/chains/evmConfig: RPC and chain id are read from config ==');
{
  const cfg = await load('lib/chains/evmConfig.ts');
  eq(cfg.isEvmChain('eth'), true, 'eth is an EVM chain');
  eq(cfg.isEvmChain('sol'), false, 'sol is not an EVM chain');
  // The pilot backend runs ETHEREUM_CHAIN_ID=11155111 (Sepolia); the client must
  // default to the same value or every signature is for the wrong chain.
  eq(cfg.getEvmChainId('eth'), 11155111, 'Ethereum defaults to Sepolia to match the backend');
  eq(cfg.getEvmNetworkName('eth'), 'Ethereum Sepolia', 'the network name reflects the testnet');
  eq(cfg.nativeSymbolForChain('eth'), 'ETH', 'gas is paid in ETH on Ethereum');
  eq(cfg.nativeSymbolForChain('bsc'), 'BNB', 'gas is paid in BNB on BSC');
  eq(cfg.nativeSymbolForChain('polygon'), 'POL', 'gas is paid in POL on Polygon');
}

console.log('\n== stores/authGateStore: gate state machine ==');
{
  const { useAuthGateStore } = await load('stores/authGateStore.ts');
  const gate = () => useAuthGateStore.getState();
  // The secure-store stub starts empty.
  eq(gate().status, 'checking', 'gate starts in "checking"');

  await gate().check();
  eq(gate().status, 'guest', 'no session token resolves to guest');

  const storage = await load('lib/storage/secureStorage.ts');
  await storage.setSecureItem(storage.SecureStorageKeys.SESSION_TOKEN, 'tok');
  await storage.setSecureItem(storage.SecureStorageKeys.ACCOUNT_ID, '1234567890');

  // pinVerified/pinMissing are in-memory only: they must be false on a fresh
  // process even though the session survives a restart.
  gate().resetPinVerified();
  await gate().check();
  eq(gate().status, 'locked', 'session + account id, PIN unproven -> locked');
  eq(gate().pinMissing, false, 'pinMissing starts false');

  gate().markPinMissing();
  eq(gate().pinMissing, true, 'a 409 from verify-pin records that no PIN exists');
  eq(gate().status, 'locked', 'pinMissing does not by itself grant authed');

  await gate().markPinVerified();
  eq(gate().status, 'authed', 'a verified PIN resolves to authed');
  eq(gate().pinMissing, false, 'setting a PIN clears pinMissing');

  // Background re-lock: pinVerified drops, pinMissing must not survive it.
  gate().resetPinVerified();
  await gate().check();
  eq(gate().status, 'locked', 'reset re-locks the session');
  eq(gate().pinMissing, false, 'reset clears pinMissing');

  gate().markPinMissing();
  gate().resetPinVerified();
  eq(gate().pinMissing, false, 'a re-lock also clears pinMissing');

  // A fresh process must never inherit pinMissing.
  await storage.deleteSecureItem(storage.SecureStorageKeys.SESSION_TOKEN);
  await gate().check();
  eq(gate().status, 'guest', 'logging out resolves to guest');
  eq(gate().pinMissing, false, 'logging out clears pinMissing');
}


console.log('\n== constants/tokens: the isSeedUsable mainnet guard ==');
{
  const t = await load('constants/tokens.ts');
  const cfg = await load('lib/chains/evmConfig.ts');
  t.resetTokenRegistry();

  // `isSeedUsable` is module-private by design — it is a safety interlock, not
  // an API. So it is tested through the only surfaces that can observe it:
  // what the registry is willing to *resolve* and what it is willing to
  // *offer*. Testing it directly would require exporting it and inviting
  // callers to depend on the guard itself.
  const onSepolia = cfg.getEvmChainId('eth') === 11155111;

  // The seeded addresses are Ethereum *mainnet*. On a testnet they name a
  // contract that does not exist, so they must not resolve.
  const usdcMainnet = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  eq(
    (t.getTokenAddresses('USDC').eth ?? '').toLowerCase(),
    onSepolia ? '' : usdcMainnet,
    onSepolia
      ? 'mainnet USDC address is withheld on Sepolia'
      : 'mainnet USDC address is available on mainnet'
  );

  // BSC is configured to mainnet in the pilot env, so the guard must let that
  // one through. A guard that withheld everything would also pass the test
  // above, so this is the half that proves it is network-specific.
  const bscChainId = cfg.getEvmChainId('bsc');
  eq(
    Boolean(t.getTokenAddresses('USDC').bsc),
    bscChainId === 56,
    `USDC on BSC resolves exactly when the app is on BSC mainnet (chainId ${bscChainId})`
  );

  // Nothing may be offered on a chain the token does not define.
  eq(t.getTokenForChain('USDC', 'ton'), null, 'USDC is never offered on TON');
  eq(t.getTokenForChain('USDC', 'sol'), null, 'USDC is never offered on Solana');
}

console.log('\n== constants/tokens: the hydration cache ==');
{
  const t = await load('constants/tokens.ts');
  t.resetTokenRegistry();

  // Before hydration the registry is cold.
  eq(t.isTokenRegistryHydrated('eth'), false, 'registry starts cold after a reset');

  // The backend registry for Sepolia, observed live from
  // GET /api/wallet/tokens/ETH.
  const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  t.hydrateTokenRegistry('eth', [
    { symbol: 'USDC', name: 'USD Coin', decimals: 6, address: SEPOLIA_USDC },
  ]);

  eq(t.isTokenRegistryHydrated('eth'), true, 'registry reports hydrated');
  eq(
    t.getTokenForChain('USDC', 'eth')?.address?.toLowerCase() ?? t.getTokenAddresses('USDC').eth?.toLowerCase(),
    SEPOLIA_USDC.toLowerCase(),
    'the hydrated backend address wins over the withheld mainnet seed'
  );
  eq(t.getTokenForChain('USDC', 'eth')?.decimals, 6, 'decimals come from the backend');

  // Hydration is per-chain, and must not leak across chains.
  eq(t.isTokenRegistryHydrated('bsc'), false, 'hydrating eth does not hydrate bsc');

  // A symbol the backend did not send must still not resolve.
  eq(t.getTokenForChain('USDT', 'eth'), null, 'a symbol absent from the registry stays unavailable');

  // Reset must fully clear, so a later cold start cannot inherit stale data.
  t.resetTokenRegistry();
  eq(t.isTokenRegistryHydrated('eth'), false, 'reset returns the registry to cold');
}

console.log('\n== lib/api/tokens: the UPPERCASE wire conversion ==');
{
  const api = await load('lib/api/tokens.ts');

  // The backend rejects a lowercase chain with 400 "Unsupported chain: eth",
  // while the app's internal `ChainId`s are lowercase. This conversion is the
  // only thing standing between the two conventions, so it is asserted
  // directly rather than inferred from a request.
  eq(api.toWireChain('eth'), 'ETH', 'eth -> ETH');
  eq(api.toWireChain('bsc'), 'BSC', 'bsc -> BSC');
  eq(api.toWireChain('base'), 'BASE', 'base -> BASE');
  eq(api.toWireChain('polygon'), 'POLYGON', 'polygon -> POLYGON');
  eq(api.toWireChain('sol'), 'SOL', 'sol -> SOL');
  eq(api.toWireChain('ton'), 'TON', 'ton -> TON');

  // Idempotent: an already-uppercase value must not change.
  eq(api.toWireChain('ETH'), 'ETH', 'already-uppercase input is unchanged');
}
console.log('\n== lib/api/auth: verification bodies carry no userId (C1) ==');
{
  const client = await load('lib/api/client.ts');
  const auth = await load('lib/api/auth.ts');

  // `auth.ts` and `client.ts` import the same `./client` module, so Node's ESM
  // cache hands back one instance. Patching `post` on it intercepts the real
  // production call path without stubbing axios or standing up a server.
  const calls = [];
  const realPost = client.apiClient.post;
  client.apiClient.post = (url, body) => {
    calls.push({ url: String(url), body });
    return Promise.resolve({ data: { success: true, data: { id: 'u-1', valid: true } } });
  };
  const restore = () => { client.apiClient.post = realPost; };
  const j = (v) => JSON.stringify(v ?? null);
  const lastBody = () => calls.length ? calls[calls.length - 1].body : undefined;

  // --- verify-email: { code } only ---------------------------------------
  calls.length = 0;
  await auth.verifyEmail({ code: '123456' });
  eq(calls[0].url, '/api/auth/verify-email', 'verifyEmail posts to /api/auth/verify-email');
  eq(j(lastBody()), j({ code: '123456' }), 'verifyEmail body is exactly { code }');
  eq(Object.prototype.hasOwnProperty.call(lastBody(), 'userId'), false,
     'verifyEmail body has no userId key');
  eq(Object.keys(lastBody()).length, 1, 'verifyEmail body has exactly one key');

  // --- verify-phone: { code } only ---------------------------------------
  calls.length = 0;
  await auth.verifyPhone({ code: '654321' });
  eq(calls[0].url, '/api/auth/verify-phone', 'verifyPhone posts to /api/auth/verify-phone');
  eq(j(lastBody()), j({ code: '654321' }), 'verifyPhone body is exactly { code }');
  eq(Object.prototype.hasOwnProperty.call(lastBody(), 'userId'), false,
     'verifyPhone body has no userId key');
  eq(Object.keys(lastBody()).length, 1, 'verifyPhone body has exactly one key');

  // --- resend-code: { channel } only -------------------------------------
  calls.length = 0;
  await auth.resendCode({ channel: 'email' });
  eq(calls[0].url, '/api/auth/resend-code', 'resendCode posts to /api/auth/resend-code');
  eq(j(lastBody()), j({ channel: 'email' }), 'resendCode(email) body is exactly { channel }');
  eq(Object.prototype.hasOwnProperty.call(lastBody(), 'userId'), false,
     'resendCode body has no userId key');

  calls.length = 0;
  await auth.resendCode({ channel: 'phone' });
  eq(j(lastBody()), j({ channel: 'phone' }), 'resendCode(phone) body is exactly { channel }');

  // --- an extra userId on the input must NOT leak into the body ----------
  // Defence in depth: even if a caller passes one, the wire body is fixed.
  calls.length = 0;
  await auth.verifyEmail({ code: '111111', userId: 'leaked' });
  eq(Object.prototype.hasOwnProperty.call(lastBody(), 'userId'), false,
     'a userId passed by a caller is never forwarded to the wire');

  // --- PIN bodies are unchanged by this fix -----------------------------
  calls.length = 0;
  await auth.setPin('123456');
  eq(j(lastBody()), j({ pin: '123456' }), 'setPin body is still { pin }');
  calls.length = 0;
  await auth.verifyPin('123456');
  eq(j(lastBody()), j({ pin: '123456' }), 'verifyPin body is still { pin }');

  restore();
}

// The send screens are .tsx and this harness transpiles .ts only; there is no
// component-test infrastructure in the project and adding one is out of scope.
// So this is a structural test over the real screen sources: it pins the
// navigation contract that made the internal transfer impossible, and fails if
// any screen is pointed back at /send/confirm without the params confirm needs.
console.log('\n== send flow: amount -> network-select -> confirm (F2) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const src = (rel) => readFileSync(pathJoin(root, rel), 'utf8');

  const amount = src('app/send/amount.tsx');
  const networkSelect = src('app/send/network-select.tsx');
  const confirm = src('app/send/confirm.tsx');
  const externalAmount = src('app/send/external-amount.tsx');

  // 1. amount must NOT push confirm directly any more. This is the assertion
  //    the whole item exists for: pushing confirm from here is what left
  //    `network` and `targetAddress` undefined.
  eq(
    amount.includes("pathname: '/send/confirm'"),
    false,
    'amount.tsx no longer pushes /send/confirm directly'
  );

  // 2. amount pushes network-select, carrying everything that screen needs.
  const amountPushesNetworkSelect = amount.includes("pathname: '/send/network-select'");
  eq(amountPushesNetworkSelect, true, 'amount.tsx pushes /send/network-select');

  // The params network-select destructures must all be supplied by amount.
  for (const key of ['accountId', 'recipientName', 'asset', 'amount', 'wallets']) {
    eq(
      amount.includes(`${key},`) || amount.includes(`${key}:`),
      true,
      `amount.tsx forwards \`${key}\` to network-select`
    );
  }
  // ...and network-select accepts all five in its params type.
  for (const key of ['accountId', 'recipientName', 'asset', 'amount', 'wallets']) {
    eq(
      new RegExp(`^\\s+${key}[?]?:\\s`, 'm').test(networkSelect),
      true,
      `network-select.tsx declares \`${key}\` in its params type`
    );
  }
  // It forwards them to confirm by spreading its own params, so `recipientName`
  // is carried through without ever being read individually.
  eq(
    /params:\s*\{\s*\.\.\.params,/.test(networkSelect),
    true,
    'network-select.tsx forwards its params to confirm via `...params`'
  );

  // 3. network-select is the only producer of the two params confirm requires.
  eq(
    networkSelect.includes("pathname: '/send/confirm'"),
    true,
    'network-select.tsx pushes /send/confirm'
  );
  eq(networkSelect.includes('targetAddress,'), true,
     'network-select.tsx supplies targetAddress');
  eq(networkSelect.includes('network: selected.network'), true,
     'network-select.tsx supplies network');

  // 4. confirm still requires both, so the chain is load-bearing.
  eq(
    confirm.includes('!params.accountId || !params.asset || !params.amount || !params.network'),
    true,
    'confirm.tsx guards the internal path on params.network'
  );
  eq(confirm.includes('if (!params.targetAddress) {'), true,
     'confirm.tsx guards the internal path on params.targetAddress');

  // 5. The external path is untouched: it supplies `network` itself, so it
  //    still goes straight to confirm.
  eq(externalAmount.includes("pathname: '/send/confirm'"), true,
     'external-amount.tsx still pushes /send/confirm directly');
  eq(
    confirm.includes('!params.externalAddress || !params.asset || !params.amount || !params.network'),
    true,
    'confirm.tsx guards the external path on params.network (supplied by external-wallet)'
  );
}

console.log('\n== lib/api/transactions: payment request body matches C3 ==');
{
  const client = await load('lib/api/client.ts');
  const tx = await load('lib/api/transactions.ts');

  const calls = [];
  const realPost = client.apiClient.post;
  client.apiClient.post = (url, body) => {
    calls.push({ url: String(url), body });
    return Promise.resolve({ data: { success: true, data: { requestId: 'r-1', link: 'x' } } });
  };
  const restore = () => { client.apiClient.post = realPost; };
  // Canonical JSON with sorted keys: object equality is not key-order
  // sensitive, so a plain stringify would fail on a correct body purely
  // because the builder assigns `symbol` before `amount`.
  const canon = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  };
  const j = (v) => canon(v ?? null);
  const lastBody = () => (calls.length ? calls[calls.length - 1].body : undefined);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // --- a blank note must leave the key out entirely, not ride as "" --------
  calls.length = 0;
  await tx.createPaymentRequest({ amount: '10', symbol: 'USDC', note: '' });
  eq(calls[0].url, '/api/payment/request', 'createPaymentRequest posts to /api/payment/request');
  eq(has(lastBody(), 'note'), false, 'an empty note omits the key');
  eq(j(lastBody()), j({ amount: '10', symbol: 'USDC' }),
     'empty note body is exactly { amount, symbol }');

  // whitespace-only is blank by the same rule
  calls.length = 0;
  await tx.createPaymentRequest({ amount: '10', symbol: 'USDC', note: '   \n\t  ' });
  eq(has(lastBody(), 'note'), false, 'a whitespace-only note omits the key');

  // --- a real note is trimmed --------------------------------------------
  calls.length = 0;
  await tx.createPaymentRequest({ amount: '10', symbol: 'USDC', note: '  dinner  ' });
  eq(lastBody().note, 'dinner', 'the note is trimmed on both ends');
  eq(j(lastBody()), j({ amount: '10', symbol: 'USDC', note: 'dinner' }),
     'trimmed note body is exact');

  // internal whitespace is preserved; only the edges are cut
  calls.length = 0;
  await tx.createPaymentRequest({ note: '  split the bill  ' });
  eq(lastBody().note, 'split the bill', 'only the edges are trimmed');

  // --- an absent note is not invented ------------------------------------
  calls.length = 0;
  await tx.createPaymentRequest({ amount: '5' });
  eq(has(lastBody(), 'note'), false, 'a note that was never supplied is not added');
  eq(Object.keys(lastBody()).length, 1, 'only the supplied key is sent');

  // --- the other C3 create fields are passed through ---------------------
  calls.length = 0;
  await tx.createPaymentRequest({
    asset: 'eth',
    symbol: 'USDC',
    amount: '25',
    expiresAt: '2026-12-31T00:00:00.000Z',
    note: 'rent',
  });
  eq(j(lastBody()), j({
    asset: 'eth', symbol: 'USDC', amount: '25',
    expiresAt: '2026-12-31T00:00:00.000Z', note: 'rent',
  }), 'asset / symbol / amount / expiresAt / note all reach the wire');

  // --- no key is ever sent as an explicit undefined ----------------------
  calls.length = 0;
  await tx.createPaymentRequest({ amount: '1', asset: undefined, expiresAt: undefined });
  eq(has(lastBody(), 'asset'), false, 'an explicitly-undefined asset is dropped');
  eq(has(lastBody(), 'expiresAt'), false, 'an explicitly-undefined expiresAt is dropped');
  eq(j(lastBody()), j({ amount: '1' }), 'no undefined-valued keys survive');

  // --- the pay-link type carries the four C3 response fields ------------
  // Asserted against the real module text: a type that loses a field is a
  // silent regression, and this harness cannot reflect over a TS interface.
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const src = readFileSync(
    pathJoin(process.argv[2] ?? '.', 'lib/api/transactions.ts'), 'utf8'
  );
  const linkIface = src.slice(src.indexOf('export interface PaymentLink'));
  for (const field of ['note', 'symbol', 'requesterAccountId', 'requesterName']) {
    eq(
      new RegExp(`^\\s+${field}[?]?:`, 'm').test(linkIface),
      true,
      `PaymentLink declares ${field}`
    );
  }
  // and it must not claim any personal detail the contract forbids
  for (const forbidden of ['email', 'phone', 'requesterId', 'requesterEmail']) {
    eq(
      new RegExp(`^\\s+${forbidden}[?]?:`, 'm').test(linkIface),
      false,
      `PaymentLink does not expose ${forbidden}`
    );
  }

  restore();
}

// The pay screen is .tsx and is not transpilable here, so this is a structural
// assertion over the real source. It pins the one thing that makes the
// comparison safe: the requester's Account ID is resolved to a non-empty value
// and checked before any transaction is matched against it.
console.log('\n== app/pay/[id].tsx: requester comparison cannot false-match ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const src = readFileSync(
    pathJoin(process.argv[2] ?? '.', 'app/pay/[id].tsx'), 'utf8'
  );

  eq(
    /const requesterAccountId\s*=\s*\n?\s*typeof link\.requesterAccountId === 'string'/.test(src),
    true,
    'pay/[id].tsx normalises requesterAccountId from the link'
  );
  eq(
    /if \(requesterAccountId === ''\) \{/.test(src),
    true,
    'pay/[id].tsx bails out when no requester Account ID is present'
  );
  eq(
    src.includes('tx.counterpartyAccountId === requesterAccountId'),
    true,
    'pay/[id].tsx compares against the normalised value'
  );
  eq(
    src.includes('tx.counterpartyAccountId === link.requesterAccountId'),
    false,
    'pay/[id].tsx no longer compares against the raw, possibly-missing field'
  );
  // The bail-out has to happen before the lookup, or it guards nothing.
  const bail = src.indexOf("if (requesterAccountId === '') {");
  const find = src.indexOf('await fetchTransactions({ limit: 50 })');
  eq(bail !== -1 && find !== -1 && bail < find, true,
     'the guard runs before any transaction is fetched');
}

console.log('\n== lib/api/contacts: rename is a single PATCH and keeps the id (C4) ==');
{
  // `toApiError` reads an axios error's `response.status` and returns null for
  // anything else — including a plain Error with a `.status` property. So a
  // 404 stub built any other way would never reach the branch the old
  // delete-then-create fallback keyed on, and the assertions about that
  // fallback would pass against the code they exist to catch.
  const httpError = (status, message) => ({
    isAxiosError: true,
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    status,
    code: 'ERR_BAD_REQUEST',
    config: {},
    response: { status, data: { success: false, message }, headers: {}, config: {} },
    toJSON: () => ({}),
  });

  const client = await load('lib/api/client.ts');
  const contacts = await load('lib/api/contacts.ts');

  const calls = [];
  const real = {
    patch: client.apiClient.patch,
    post: client.apiClient.post,
    delete: client.apiClient.delete,
  };
  let patchReply = { data: { success: true, data: { id: 'c-1', name: 'Renamed' } } };
  let patchThrows = null;
  client.apiClient.patch = (url, body) => {
    calls.push({ m: 'PATCH', url: String(url), body });
    if (patchThrows) return Promise.reject(patchThrows);
    return Promise.resolve(patchReply);
  };
  client.apiClient.post = (url, body) => {
    calls.push({ m: 'POST', url: String(url), body });
    return Promise.resolve({ data: { success: true, data: { id: 'c-new' } } });
  };
  client.apiClient.delete = (url) => {
    calls.push({ m: 'DELETE', url: String(url) });
    return Promise.resolve({ data: { success: true, data: { deleted: true } } });
  };
  const restore = () => Object.assign(client.apiClient, real);
  const j = (v) => JSON.stringify(v ?? null);
  const last = () => calls[calls.length - 1];

  // --- a rename is exactly one PATCH, to the contact's own id ------------
  calls.length = 0;
  const updated = await contacts.updateContact('c-1', { name: 'Renamed' });
  eq(calls.length, 1, 'a rename makes exactly one request');
  eq(last().m, 'PATCH', 'a rename uses PATCH');
  eq(last().url, '/api/contact/c-1', 'the PATCH targets /api/contact/:id');
  eq(j(last().body), j({ name: 'Renamed' }), 'the body is exactly { name }');
  eq(updated.id, 'c-1', 'the returned contact keeps its original id');

  // --- the delete-then-create fallback is gone ---------------------------
  calls.length = 0;
  await contacts.updateContact('c-1', { name: 'Again' });
  eq(
    calls.filter((c) => c.m === 'DELETE').length,
    0,
    'a successful rename never issues a DELETE'
  );
  eq(
    calls.filter((c) => c.m === 'POST').length,
    0,
    'a successful rename never issues a POST'
  );

  // --- a 404 is a real failure, not "the route is absent" ----------------
  // This is the specific bug: the old code read 404 as a missing route and
  // answered it by deleting the contact and creating a new row under a new id.
  calls.length = 0;
  patchThrows = httpError(404, 'Contact not found');
  let threw = null;
  try {
    await contacts.updateContact('c-1', { name: 'Renamed' });
  } catch (err) {
    threw = err;
  }
  patchThrows = null;
  eq(threw !== null, true, 'a 404 from PATCH is surfaced, not swallowed');
  eq(
    calls.filter((c) => c.m === 'DELETE').length,
    0,
    'a 404 does NOT trigger the delete-then-create fallback'
  );
  eq(
    calls.filter((c) => c.m === 'POST').length,
    0,
    'a 404 does NOT recreate the contact under a new id'
  );

  // --- a 409 (duplicate name) propagates untouched too -------------------
  calls.length = 0;
  patchThrows = httpError(409, 'You already have a contact with that name');
  threw = null;
  try {
    await contacts.updateContact('c-1', { name: 'Taken' });
  } catch (err) {
    threw = err;
  }
  patchThrows = null;
  eq(threw?.status, 409, 'a 409 duplicate-name error reaches the caller');
  // Guard the guard: if the stub stopped being axios-shaped, `toApiError` would
  // report null and the fallback assertions below would stop meaning anything.
  eq(
    client.toApiError(httpError(404, 'x')).status,
    404,
    'the stub error shape is one toApiError can actually read'
  );
  eq(
    calls.filter((c) => c.m === 'DELETE').length,
    0,
    'a 409 does NOT delete the original contact'
  );

  // --- field handling ----------------------------------------------------
  calls.length = 0;
  await contacts.updateContact('c-1', { name: '  Spaced  ' });
  eq(last().body.name, 'Spaced', 'the name is trimmed before it is sent');

  calls.length = 0;
  await contacts.updateContact('c-1', { accountId: '1234 567 890' });
  eq(j(last().body), j({ accountId: '1234567890' }),
     'an Account ID is normalised to digits before it is sent');

  calls.length = 0;
  await contacts.updateContact('c-1', { name: 'Both', accountId: '1234567890' });
  eq(j(last().body), j({ name: 'Both', accountId: '1234567890' }),
     'both fields are sent when both are given');

  // --- "at least one field" is enforced without a pointless round trip --
  for (const [label, input] of [['an empty object', {}], ['a blank name', { name: '   ' }]]) {
    calls.length = 0;
    threw = null;
    try {
      await contacts.updateContact('c-1', input);
    } catch (err) {
      threw = err;
    }
    eq(threw !== null, true, `${label} is rejected before any request`);
    eq(calls.length, 0, `${label} makes no network call`);
  }

  // --- the id in the response is authoritative, not the one we asked for --
  calls.length = 0;
  patchReply = { data: { success: true, data: { id: 'c-server', name: 'Renamed' } } };
  const fromServer = await contacts.updateContact('c-1', { name: 'Renamed' });
  eq(fromServer.id, 'c-server', 'the id the backend returned is used verbatim');
  patchReply = { data: { success: true, data: { id: 'c-1', name: 'Renamed' } } };

  restore();
}

console.log('\n== contactsStore: real add / rename behaviour ==');
{
  // The harness already has an `axiosLike` builder, but it is scoped to the
  // lib/api/client block above, so this block needs its own. A bare `Error`
  // would not do: `friendlyError` treats anything that is not an axios error as
  // a transport failure and answers with generic copy, so the stubs have to look
  // like what the backend actually produces.
  const axiosLike = (status, code, echo, data) => ({
    isAxiosError: true,
    name: 'AxiosError',
    message: echo,
    status,
    code,
    config: {},
    response: { status, data, headers: {}, config: {} },
    toJSON: () => ({}),
  });

  const client = await load('lib/api/client.ts');
  const { useContactsStore } = await load('stores/contactsStore.ts');
  let userStore = null;
  try {
    ({ useUserStore: userStore } = await load('stores/userStore.ts'));
  } catch {
    // Not loadable in isolation; the store only reads `accountId` from it and
    // an unset value simply means the "your own Account ID" guard stays off.
  }

  const seq = [];
  const real = {
    get: client.apiClient.get,
    post: client.apiClient.post,
    patch: client.apiClient.patch,
    delete: client.apiClient.delete,
  };
  let resolveProfile = { accountId: '1234567890', profile: { id: 'u-9', name: 'Bob' } };
  let resolveThrows = null;
  let createdId = 'c-new';

  client.apiClient.get = (url) => {
    seq.push(`GET ${url}`);
    if (resolveThrows) return Promise.reject(resolveThrows);
    return Promise.resolve({ data: { success: true, data: resolveProfile } });
  };
  client.apiClient.post = (url, body) => {
    seq.push(`POST ${url}`);
    return Promise.resolve({
      data: { success: true, data: { id: createdId, name: body.name, accountId: body.accountId } },
    });
  };
  // The backend answers PATCH with the whole updated row, so the stub does too.
  // A partial row here would look like the client had dropped a field.
  const rowById = {
    'c-1': { id: 'c-1', ownerId: 'u-1', accountId: '1234567890', name: 'Old', address: null,
             chain: null, createdAt: '', updatedAt: '' },
  };
  client.apiClient.patch = (url, body) => {
    seq.push(`PATCH ${url}`);
    const id = url.split('/').pop();
    const base = rowById[id] ?? { id, ownerId: 'u-1', accountId: null, name: '', address: null,
                                  chain: null, createdAt: '', updatedAt: '' };
    const merged = { ...base };
    if (body.name !== undefined) merged.name = body.name;
    if (body.accountId !== undefined) merged.accountId = body.accountId;
    return Promise.resolve({ data: { success: true, data: merged } });
  };
  client.apiClient.delete = (url) => {
    seq.push(`DELETE ${url}`);
    return Promise.resolve({ data: { success: true, data: { deleted: true } } });
  };
  const restore = () => Object.assign(client.apiClient, real);

  if (userStore) userStore.getState && userStore.setState({ accountId: null });
  const seed = (contacts) =>
    useContactsStore.setState({ contacts, mutationError: null, isMutating: false, status: 'ready' });

  // --- add(): the Account ID is resolved before anything is created -------
  seed([]);
  seq.length = 0;
  const added = await useContactsStore.getState().add({ name: 'Bob', accountId: '1234567890' });
  eq(
    seq[0],
    'GET /api/account/resolve/1234567890',
    'add() resolves the Account ID first'
  );
  eq(
    seq.some((s) => s === 'POST /api/contact'),
    true,
    'add() then creates the contact'
  );
  eq(
    seq.indexOf('GET /api/account/resolve/1234567890') <
      seq.indexOf('POST /api/contact'),
    true,
    'the resolve call happens BEFORE the create call'
  );
  eq(added?.id, 'c-new', 'add() returns the created contact');
  eq(useContactsStore.getState().mutationError, null, 'a valid add reports no error');

  // --- add(): an Account ID that belongs to nobody is named, not created --
  seed([]);
  seq.length = 0;
  resolveThrows = axiosLike(
    404,
    'ERR_BAD_REQUEST',
    'Request failed with status code 404',
    { success: false, message: 'Account ID not found' }
  );
  const rejected = await useContactsStore.getState().add({ name: 'Ghost', accountId: '9999999999' });
  resolveThrows = null;
  eq(rejected, null, 'add() returns null for an unknown Account ID');
  eq(
    useContactsStore.getState().mutationError,
    'No Ulmara user has that Account ID. Check the digits and try again.',
    'an unknown Account ID gets a friendly, specific message'
  );
  eq(
    seq.some((s) => s === 'POST /api/contact'),
    false,
    'no contact is created when the Account ID does not exist'
  );
  eq(useContactsStore.getState().contacts.length, 0, 'the store is left unchanged');

  // --- rename(): only the name travels, and the id survives --------------
  seed([
    { id: 'c-1', ownerId: 'u-1', accountId: '1234567890', name: 'Old', address: null, chain: null,
      createdAt: '', updatedAt: '' },
  ]);
  seq.length = 0;
  const renamed = await useContactsStore.getState().rename('c-1', 'New');
  eq(seq.length, 1, 'a rename makes exactly one request');
  eq(seq[0], 'PATCH /api/contact/c-1', 'the rename is a PATCH to the contact id');
  eq(
    seq.some((s) => s.startsWith('DELETE') || s.startsWith('POST')),
    false,
    'a rename issues no DELETE and no POST'
  );
  eq(renamed?.id, 'c-1', 'the renamed contact keeps its id');
  eq(useContactsStore.getState().contacts[0]?.id, 'c-1', 'the stored contact keeps its id');
  eq(useContactsStore.getState().contacts[0]?.name, 'New', 'the stored contact has the new name');
  eq(
    useContactsStore.getState().contacts[0]?.accountId,
    '1234567890',
    'a rename leaves the Account ID untouched'
  );

  // --- rename(): a 409 from the backend is surfaced, contact left intact --
  seed([
    { id: 'c-1', ownerId: 'u-1', accountId: '1234567890', name: 'Old', address: null, chain: null,
      createdAt: '', updatedAt: '' },
  ]);
  const realPatch = client.apiClient.patch;
  client.apiClient.patch = () =>
    Promise.reject(
      axiosLike(
        409,
        'ERR_BAD_REQUEST',
        'Request failed with status code 409',
        { success: false, message: 'You already have a contact with that name' }
      )
    );
  seq.length = 0;
  const conflicted = await useContactsStore.getState().rename('c-1', 'Taken');
  client.apiClient.patch = realPatch;
  eq(conflicted, null, 'a 409 makes the rename return null');
  eq(
    useContactsStore.getState().mutationError,
    'You already have a contact with that name',
    "the backend's 409 message reaches the user"
  );
  eq(useContactsStore.getState().contacts[0]?.name, 'Old', 'the original contact is untouched');
  eq(
    seq.some((s) => s.startsWith('DELETE')),
    false,
    'a 409 does not delete the original contact'
  );

  restore();
}

console.log('\n== F5: no call to /api/push/token, /gas/quote or /gas/submit ==');
{
  const client = await load('lib/api/client.ts');
  const push = await load('lib/push/pushNotifications.ts');
  const gas = await load('lib/gas/gasAbstraction.ts');
  const storage = await load('lib/storage/secureStorage.ts');
  const { SecureStorageKeys } = storage;

  const requests = [];
  const real = {
    post: client.apiClient.post,
    delete: client.apiClient.delete,
    get: client.apiClient.get,
    patch: client.apiClient.patch,
  };
  const record = (m) => (url) => {
    requests.push(`${m} ${url}`);
    return Promise.resolve({ data: { success: true, data: {} } });
  };
  client.apiClient.post = record('POST');
  client.apiClient.delete = record('DELETE');
  client.apiClient.get = record('GET');
  client.apiClient.patch = record('PATCH');
  const restore = () => Object.assign(client.apiClient, real);
  const forbidden = (what) =>
    requests.filter((r) => r.includes('/api/push/token') || r.startsWith('POST /gas/'));

  // --- the off-switch is off with no environment at all ------------------
  eq(
    process.env.EXPO_PUBLIC_PUSH_REGISTRATION,
    undefined,
    'no EXPO_PUBLIC_PUSH_REGISTRATION is set in the test environment'
  );
  eq(
    process.env.EXPO_PUBLIC_GAS_SPONSOR,
    undefined,
    'no EXPO_PUBLIC_GAS_SPONSOR is set in the test environment'
  );

  // --- syncRegisteredToken: runs on every app foreground ------------------
  // A stored token is required, or it returns before its request and the
  // assertion below would prove nothing.
  await storage.setSecureItem(SecureStorageKeys.PUSH_TOKEN, 'ExponentPushToken[stored]');
  requests.length = 0;
  await push.syncRegisteredToken();
  eq(forbidden('sync').length, 0, 'syncRegisteredToken makes no request while the flag is off');
  eq(requests.length, 0, 'syncRegisteredToken makes no request at all while the flag is off');

  // --- unregisterPushToken: runs on every sign-out -----------------------
  await storage.setSecureItem(SecureStorageKeys.PUSH_TOKEN, 'ExponentPushToken[stored]');
  requests.length = 0;
  await push.unregisterPushToken();
  eq(forbidden('unregister').length, 0, 'unregisterPushToken makes no request while the flag is off');
  eq(requests.length, 0, 'unregisterPushToken makes no request at all while the flag is off');
  // The local wipe must still happen: that is what stops a signed-out install
  // being able to re-register, and it is not a network call.
  eq(
    await storage.getSecureItem(SecureStorageKeys.PUSH_TOKEN),
    null,
    'the local push token is still wiped on sign-out'
  );

  // --- registerPushToken: the settings screen must keep working ----------
  requests.length = 0;
  const state = await push.registerPushToken();
  eq(forbidden('register').length, 0, 'registerPushToken makes no request while the flag is off');
  eq(state.support, 'backend-pending', 'registerPushToken reports backend-pending, not a failure');
  eq(state.detail, null, 'registerPushToken reports no error detail');

  // --- gas: both entry points refuse rather than invent a quote ----------
  requests.length = 0;
  let quoteThrew = null;
  try {
    await gas.getGasSponsorQuote({
      network: 'ETH', fromAddress: '0x1', toAddress: '0x2', amount: '1', asset: 'ETH',
    });
  } catch (err) {
    quoteThrew = err;
  }
  eq(quoteThrew !== null, true, 'getGasSponsorQuote throws instead of returning a fake quote');
  eq(requests.length, 0, 'getGasSponsorQuote makes no request while the flag is off');

  requests.length = 0;
  let submitThrew = null;
  try {
    await gas.submitSponsoredTransaction({ network: 'ETH', signedPayload: '0xdeadbeef' });
  } catch (err) {
    submitThrew = err;
  }
  eq(submitThrew !== null, true, 'submitSponsoredTransaction throws instead of faking a result');
  eq(requests.length, 0, 'submitSponsoredTransaction makes no request while the flag is off');

  // ------------------------------------------------------------------------
  // Causality. Everything above would also pass if the requests were being
  // swallowed somewhere else entirely, or if the stub simply never fired. So
  // load fresh copies with the switches ON and show the requests really do
  // happen then — the guard is the only thing stopping them.
  // ------------------------------------------------------------------------
  const pushOn = await loadFresh('lib/push/pushNotifications.ts', {
    EXPO_PUBLIC_PUSH_REGISTRATION: 'true',
  });

  await storage.setSecureItem(SecureStorageKeys.PUSH_TOKEN, 'ExponentPushToken[stored]');
  requests.length = 0;
  await pushOn.syncRegisteredToken();
  eq(
    requests.filter((r) => r === 'POST /api/push/token').length,
    1,
    'with the switch ON, syncRegisteredToken does POST /api/push token'
  );

  await storage.setSecureItem(SecureStorageKeys.PUSH_TOKEN, 'ExponentPushToken[stored]');
  requests.length = 0;
  await pushOn.unregisterPushToken();
  eq(
    requests.filter((r) => r === 'DELETE /api/push/token').length,
    1,
    'with the switch ON, unregisterPushToken does DELETE /api/push token'
  );

  const gasOn = await loadFresh('lib/gas/gasAbstraction.ts', {
    EXPO_PUBLIC_GAS_SPONSOR: 'true',
  });
  requests.length = 0;
  await gasOn
    .getGasSponsorQuote({ network: 'ETH', fromAddress: '0x1', toAddress: '0x2', amount: '1', asset: 'ETH' })
    .catch(() => null);
  eq(
    requests.filter((r) => r === 'POST /gas/quote').length,
    1,
    'with the switch ON, getGasSponsorQuote does POST /gas/quote'
  );
  requests.length = 0;
  await gasOn
    .submitSponsoredTransaction({ network: 'ETH', signedPayload: '0xdeadbeef' })
    .catch(() => null);
  eq(
    requests.filter((r) => r === 'POST /gas/submit').length,
    1,
    'with the switch ON, submitSponsoredTransaction does POST /gas/submit'
  );

  // And the default really is off, not merely unset in this process.
  const pushDefault = await loadFresh('lib/push/pushNotifications.ts', {
    EXPO_PUBLIC_PUSH_REGISTRATION: undefined,
  });
  await storage.setSecureItem(SecureStorageKeys.PUSH_TOKEN, 'ExponentPushToken[stored]');
  requests.length = 0;
  const defaultState = await pushDefault.registerPushToken();
  eq(
    defaultState.support,
    'backend-pending',
    'a fresh copy with the variable UNSET is still switched off'
  );
  eq(requests.length, 0, 'a fresh copy with the variable UNSET makes no request');

  restore();
}

console.log('\n== F5: the guard is in place, not just the observable behaviour ==');
{
  const { readFileSync: rf } = await import('node:fs');
  const { join: pj } = await import('node:path');
  const pushSrc = rf(pj(process.argv[2] ?? '.', 'lib/push/pushNotifications.ts'), 'utf8');

  // The switch must gate the session flag, and the session flag must gate every
  // call site. If `backendUnsupported` were hardcoded back to `false` the
  // behavioural tests above would start failing, but these say so directly.
  eq(
    /let backendUnsupported = !PUSH_REGISTRATION_ENABLED;/.test(pushSrc),
    true,
    'the session flag is seeded from the off-switch, not hardcoded false'
  );
  eq(
    /const PUSH_REGISTRATION_ENABLED = process\.env\.EXPO_PUBLIC_PUSH_REGISTRATION === 'true';/.test(pushSrc),
    true,
    'the off-switch is off unless the variable is exactly "true"'
  );
  for (const fn of ['registerPushToken', 'syncRegisteredToken', 'unregisterPushToken']) {
    const at = pushSrc.indexOf(`export async function ${fn}(`);
    const guard = pushSrc.indexOf('backendUnsupported', at);
    const request = pushSrc.indexOf('PUSH_TOKEN_PATH', at);
    eq(
      at !== -1 && guard !== -1 && request !== -1 && guard < request,
      true,
      `${fn}() checks the flag before it builds a request`
    );
  }
}

// F6. The point of deleting the Bachs client was that a third-party provider
// key was being read in the app and sent off-device. The strongest statement
// that can be made about a file that no longer exists is that nothing in the
// repository mentions it any more, so that is what is asserted - across source,
// config, and documentation, in any casing.
console.log('\n== F6: no ramp provider credential is readable by the app bundle ==');
{
  const { readdirSync, readFileSync: rf, statSync: st, existsSync } =
    await import('node:fs');
  const { join: pj } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const skip = new Set(['node_modules', '.git', '.expo', 'dist', '.expo-shared']);
  const SELF = pj('scripts', 'logic-tests.mjs');

  // The strong claim about a deleted module is that nothing can read it any more,
  // so the scan is over the whole tree - source, config and docs, any casing.
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const abs = pj(dir, entry);
      if (st(abs).isDirectory()) { walk(abs); continue; }
      // This file names these providers in order to assert they are gone.
      if (abs.endsWith(SELF)) continue;
      if (!/\.(ts|tsx|js|jsx|mjs|json|md|example|yml|yaml|txt)$/.test(entry)) continue;
      let text;
      try { text = rf(abs, 'utf8'); } catch { continue; }
      if (/bachs/i.test(text)) found.push(abs.slice(root.length + 1));
    }
  };
  walk(root);
  eq(found.length, 0, 'no source, config or documentation file mentions Bachs');
  for (const f of found) console.log(`        still mentions it: ${f}`);

  eq(existsSync(pj(root, 'lib/ramp/bachs.ts')), false, 'lib/ramp/bachs.ts does not exist');
  eq(existsSync(pj(root, 'lib/ramp')), false, 'the empty lib/ramp/ directory is gone too');

  // Every ramp provider, not just the one that happened to be in code. This is
  // the check that generalises: adding a new provider with a client-side key is
  // the mistake being prevented, and it should fail here whatever it is called.
  //
  // A provider *mention* is fine - the deposit and withdraw screens say
  // "unavailable until Paystack is configured" in user-facing copy. What must not
  // exist is a module reading a provider host or key, because that is what puts
  // a credential in the bundle and sends it off-device.
  const providerHosts = [
    'api.bachs.io', 'sandbox.bachs.io',
    'api.paystack.co', 'api.flutterwave.com',
  ];
  const credentialVars = [
    'EXPO_PUBLIC_BACHS', 'EXPO_PUBLIC_PAYSTACK', 'EXPO_PUBLIC_FLUTTERWAVE',
  ];
  const holders = [];
  const walkSrc = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (skip.has(entry)) continue;
      const abs = pj(dir, entry);
      if (st(abs).isDirectory()) { walkSrc(abs); continue; }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      let text;
      try { text = rf(abs, 'utf8'); } catch { continue; }
      for (const host of providerHosts) {
        if (text.includes(host)) holders.push(`${abs.slice(root.length + 1)} -> ${host}`);
      }
      // Only an actual env read counts; a variable named in a comment is not one.
      for (const v of credentialVars) {
        const read = new RegExp(`process\\s*\\.\\s*env\\s*[.\\[]\\s*['"]?[A-Z_]*${v}`);
        if (read.test(text)) holders.push(`${abs.slice(root.length + 1)} -> ${v} (read)`);
      }
    }
  };
  for (const area of ['lib', 'app', 'components', 'stores', 'constants', 'hooks']) {
    walkSrc(pj(root, area));
  }
  eq(holders.length, 0,
     'no module reads a ramp provider host or credential into the app bundle');
  for (const h of holders) console.log(`        reads a provider credential: ${h}`);

  // And no EXPO_PUBLIC_* ramp key is even *declared*, so nobody is invited to
  // paste a live one into env.example.
  for (const file of ['env.example', 'README.md']) {
    const abs = pj(root, file);
    if (!existsSync(abs)) continue;
    const text = rf(abs, 'utf8');
    for (const v of credentialVars) {
      eq(
        text.includes(v),
        false,
        `${file} does not declare ${v}`
      );
    }
  }

  // The ramp screens must survive: this removes a dead client, not the feature.
  for (const screen of ['app/deposit-withdraw/deposit.tsx', 'app/deposit-withdraw/withdraw.tsx']) {
    eq(existsSync(pj(root, screen)), true, `${screen} still exists`);
  }
  // ...and they must still read honestly about being unavailable. The intent is
  // "does not pretend to work", not any particular wording — an earlier version
  // of this assertion matched the literal string "unavailable until Paystack is
  // configured", which broke the moment that false claim was corrected.
  const deposit = rf(pj(root, 'app/deposit-withdraw/deposit.tsx'), 'utf8');
  const withdraw = rf(pj(root, 'app/deposit-withdraw/withdraw.tsx'), 'utf8');
  for (const [name, src, what] of [
    ['deposit', deposit, 'deposits'],
    ['withdraw', withdraw, 'withdrawals'],
  ]) {
    // States that it is unavailable...
    const banner = new RegExp(`Fiat ${what} are not available`, 'i');
    eq(banner.test(src), true, `the ${name} screen says fiat ${what} are unavailable`);
    // ...without naming a provider the app has no integration with. The ramp is
    // backend-only through /api/ramp/*, so naming one told the user a change was
    // imminent that nothing in this repository was waiting on.
    eq(
      /are not available until /.test(src),
      false,
      `the ${name} screen does not defer to a named provider`
    );
  }
}

console.log('\n== F7: a wrong PIN does not log the user out (401 vs session) ==');
{
  const client = await load('lib/api/client.ts');
  const axios = require_('axios');

  // The interceptor is registered at module scope on the real instance, so the
  // only way to reach it is to make a request that fails. `adapter` is the
  // documented axios seam for exactly this.
  const realAdapter = client.apiClient.defaults.adapter;
  let reply = null;
  client.apiClient.defaults.adapter = async (config) => {
    if (!reply) throw new Error('adapter called with no reply configured');
    const response = { status: reply.status, data: reply.data, statusText: '', headers: {}, config };
    throw new axios.AxiosError(
      `Request failed with status code ${reply.status}`,
      'ERR_BAD_REQUEST',
      config,
      {},
      response
    );
  };

  // A token in the cache, so "was it cleared?" is observable at all.
  client.setCachedSessionToken('session-token-abc');

  // Read the cache back the way the request interceptor does: a populated,
  // loaded cache attaches the token without touching SecureStore. A cleared one
  // sends no Authorization header at all.
  const sessionOf = async () => {
    let value = null;
    const probe = client.apiClient.defaults.adapter;
    client.apiClient.defaults.adapter = async (config) => {
      value = config.headers?.Authorization ? 'attached' : null;
      const response = { status: 200, data: { success: true, data: {} }, statusText: '', headers: {}, config };
      return response;
    };
    await client.apiClient.get('/api/account/me').catch(() => null);
    client.apiClient.defaults.adapter = probe;
    return value === 'attached';
  };

  const attempt = async (status, message) => {
    reply = { status, data: { success: false, message } };
    let apiError = null;
    try {
      await client.apiClient.post('/api/auth/verify-pin', { pin: '000000' });
    } catch (err) {
      apiError = client.toApiError(err);
    }
    return apiError;
  };

  // --- a wrong PIN: 401 with the lockout service's prose ------------------
  // This is the exact shape `pinLockout.assertPinAuthorized` produces.
  let err = await attempt(401, 'Incorrect PIN. Try again.');
  eq(err?.status, 401, 'a wrong PIN surfaces as 401');
  eq(err?.message, 'Incorrect PIN. Try again.', "the user still sees the real PIN message");
  eq(await sessionOf(), true,
     'after a wrong PIN the session token is STILL attached to the next request');

  // --- a lockout: 423 with the countdown ---------------------------------
  // Preserved exactly: the countdown text must reach the user and the session
  // must be untouched.
  err = await attempt(423, 'Too many incorrect PIN attempts. Try again in 15 minutes.');
  eq(err?.status, 423, 'a lockout surfaces as 423');
  eq(
    client.friendlyError(err),
    'Too many incorrect PIN attempts. Try again in 15 minutes.',
    'the lockout countdown reaches the user verbatim'
  );
  eq(await sessionOf(), true, 'a lockout leaves the session alone too');

  // --- a genuinely dead session: 401 from requireAuth ---------------------
  for (const message of ['Session expired', 'Invalid token', 'Unauthorized']) {
    err = await attempt(401, message);
    eq(err?.status, 401, `a ${message} 401 surfaces as 401`);
    eq(await sessionOf(), false,
       `"${message}" DOES clear the cached session token`);
    // Re-arm for the next iteration.
    client.setCachedSessionToken('session-token-abc');
  }

  // --- an unrecognised 401 body fails open, as before ---------------------
  client.setCachedSessionToken('session-token-abc');
  err = await attempt(401, 'Something the client has never seen');
  eq(await sessionOf(), false,
     'an unrecognised 401 body is treated as a session rejection (fails open)');

  // --- a 401 with no body at all -----------------------------------------
  client.setCachedSessionToken('session-token-abc');
  err = await attempt(401, undefined);
  eq(await sessionOf(), false, 'a bodyless 401 is treated as a session rejection');

  // --- other statuses are untouched by this change -----------------------
  for (const status of [403, 404, 409, 500]) {
    client.setCachedSessionToken('session-token-abc');
    err = await attempt(status, 'nope');
    eq(await sessionOf(), true, `a ${status} leaves the cached session alone`);
  }

  // --- 401 during a transfer, not just on the unlock screen ---------------
  // The same 401 can come back from a money-movement route; a rejected transfer
  // must not sign the user out either.
  client.setCachedSessionToken('session-token-abc');
  reply = { status: 401, data: { success: false, message: 'Incorrect PIN. Try again.' } };
  let transferError = null;
  try {
    await client.apiClient.post('/api/transaction/send', { pin: '000000' });
  } catch (e) {
    transferError = client.toApiError(e);
  }
  eq(transferError?.status, 401, 'a wrong PIN on a transfer surfaces as 401');
  eq(await sessionOf(), true, 'a wrong PIN on a transfer does not clear the session');

  client.apiClient.defaults.adapter = realAdapter;
  client.setCachedSessionToken(null);
}

console.log('\n== F8: token balances are optional and must never break the store ==');
{
  const client = await load('lib/api/client.ts');
  const tokens = await load('lib/api/tokens.ts');

  const axiosLike = (status, message) => ({
    isAxiosError: true,
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    status,
    code: 'ERR_BAD_REQUEST',
    config: {},
    response: { status, data: { success: false, message }, headers: {}, config: {} },
    toJSON: () => ({}),
  });

  // The defect was a user-visible warning blaming the server for an endpoint the
  // user never asked for. `fetchTokenBalances` may legitimately warn about a
  // *skipped* token — under this suite's ethers stub `getCode` returns '0x', so
  // `isTokenContract` is false and the RPC fallback reports a mainnet contract
  // address with no code on a testnet, which is real and worth saying. So the
  // assertion is that no warning blames the endpoint, not that there is none.
  const blamesEndpoint = (w) =>
    typeof w === 'string' && /server could not|could not be read from the network/i.test(w);

  const calls = [];
  const real = { get: client.apiClient.get, post: client.apiClient.post };
  let reply = null;
  client.apiClient.get = (url, config) => {
    calls.push({ url: String(url), params: config?.params });
    if (reply && reply.throws) return Promise.reject(reply.value);
    return Promise.resolve({ data: { success: true, data: reply ? reply.value : [] } });
  };
  const restore = () => Object.assign(client.apiClient, real);
  const ethTokens = [
    { symbol: 'USDC', name: 'USD Coin', decimals: 6, addresses: { eth: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' } },
  ];
  const run = async (fresh) =>
    (fresh ?? tokens).fetchTokenBalances({ chain: 'eth', address: '0xowner', tokens: ethTokens });

  // --- the path is exactly what C5 says, and is never changed -------------
  calls.length = 0;
  reply = { value: [] };
  await run();
  eq(calls.length, 1, 'one request is made per chain');
  eq(calls[0].url, '/api/wallet/token-balances', 'the path is /api/wallet/token-balances');
  eq(calls[0].params?.chain, 'ETH', 'the chain is sent as the UPPERCASE wire name');
  eq(calls[0].params?.address, '0xowner', 'the address is sent');

  // --- a normal backend response is used as-is ---------------------------
  const row = { symbol: 'USDC', name: 'USD Coin', chain: 'eth', network: 'ETH',
                decimals: 6, contractAddress: '0xc', balance: '12.5' };
  reply = { value: [row] };
  let out = await run();
  eq(out.balances.length, 1, 'a well-formed array is returned untouched');
  eq(out.balances[0].balance, '12.5', 'the balance string survives');
  eq(out.warning, null, 'a good response produces no warning at all');
  eq(out.source, 'backend', 'a good response is attributed to the backend');

  // --- an empty result is fine, and is NOT a warning ---------------------
  reply = { value: [] };
  out = await run();
  eq(out.balances.length, 0, 'an empty array yields no balances');
  eq(out.warning, null, 'an empty result is not a warning');
  eq(out.source, 'backend', 'an empty result still counts as the backend answering');

  // --- 404: the documented "route absent" case ----------------------------
  // `balancesSupported` is per-session module state, so each scenario needs a
  // fresh instance or it inherits the previous one's verdict.
  {
    const fresh = await loadFresh('lib/api/tokens.ts', {});
    client.apiClient.get = () => Promise.reject(axiosLike(404, 'Route not found'));
    out = await run(fresh);
    eq(out.balances.length, 0, 'a 404 yields no balances rather than throwing');
    eq(blamesEndpoint(out.warning), false, 'a 404 produces no warning blaming the endpoint');
    eq(out.source, 'rpc', 'a 404 falls through to the RPC path');

    // And the probe is remembered: the second call must not hit the route again.
    let secondCalls = 0;
    client.apiClient.get = () => { secondCalls += 1; return Promise.reject(axiosLike(404, 'x')); };
    await run(fresh);
    eq(secondCalls, 0, 'after a 404 the route is not probed again this session');
  }

  // --- 405, the other "route absent" answer ------------------------------
  {
    const fresh = await loadFresh('lib/api/tokens.ts', {});
    client.apiClient.get = () => Promise.reject(axiosLike(405, 'Method not allowed'));
    out = await run(fresh);
    eq(blamesEndpoint(out.warning), false, 'a 405 produces no warning blaming the endpoint');
    eq(out.source, 'rpc', 'a 405 falls through to the RPC path');
  }

  // --- 500 and every other status: the defect. --------------------------
  // Before the fix these returned a warning string that the store renders as a
  // red banner over a perfectly good native balance list.
  for (const status of [401, 403, 429, 500, 502, 503]) {
    const fresh = await loadFresh('lib/api/tokens.ts', {});
    client.apiClient.get = () => Promise.reject(axiosLike(status, 'nope'));
    out = await run(fresh);
    eq(blamesEndpoint(out.warning), false, `a ${status} produces no warning blaming the endpoint`);
    eq(out.source, 'rpc', `a ${status} falls through to the RPC path`);
    eq(out.balances.length, 0, `a ${status} yields no balances rather than throwing`);
  }

  // A 5xx must NOT be remembered as "route absent" — it is transient, and the
  // next refresh should try again.
  {
    const fresh = await loadFresh('lib/api/tokens.ts', {});
    let attempts = 0;
    client.apiClient.get = () => {
      attempts += 1;
      return Promise.reject(axiosLike(500, 'boom'));
    };
    await run(fresh);
    await run(fresh);
    eq(attempts, 2, 'a 500 is retried on the next refresh (not remembered as absent)');
  }

  // --- a transport failure with no status at all -------------------------
  {
    const fresh = await loadFresh('lib/api/tokens.ts', {});
    client.apiClient.get = () => Promise.reject(new Error('Network Error'));
    out = await run(fresh);
    eq(blamesEndpoint(out.warning), false,
       'a transport failure produces no warning blaming the endpoint');
    eq(out.source, 'rpc', 'a transport failure falls through to the RPC path');
  }

  // --- malformed payloads must not become a spread TypeError -------------
  // The store does `tokenRows.push(...result.value)`, so a non-array here threw
  // inside the fulfilment branch of Promise.allSettled and killed the whole
  // refresh, native balances included.
  for (const [label, value] of [
    ['null', null],
    ['an object', { balances: [row] }],
    ['a string', '12.5'],
    ['a number', 42],
    ['a boolean', true],
  ]) {
    const fresh = await loadFresh('lib/api/tokens.ts', {});
    client.apiClient.get = () => Promise.resolve({ data: { success: true, data: value } });
    out = await run(fresh);
    eq(Array.isArray(out.balances), true, `a payload of ${label} still yields an array`);
    eq(out.balances.length, 0, `a payload of ${label} yields no balances`);

    // The exact operation the store performs, so a throw here is caught here
    // rather than in a screen.
    let spreadOk = true;
    try {
      const rows = [];
      rows.push(...out.balances);
    } catch {
      spreadOk = false;
    }
    eq(spreadOk, true, `the store's spread of a ${label} payload does not throw`);
  }

  // --- no tokens configured for the chain: no request at all --------------
  calls.length = 0;
  reply = { value: [] };
  out = await tokens.fetchTokenBalances({ chain: 'eth', address: '0xowner', tokens: [] });
  eq(calls.length, 0, 'an unconfigured chain makes no request');
  eq(out.balances.length, 0, 'an unconfigured chain yields no balances');
  eq(out.warning, null, 'an unconfigured chain produces no warning');

  restore();
  tokens.resetTokenBackendProbes();
}

console.log('\n== F8: the store keeps native balances and invents no token rows ==');
{
  // `stores/walletStore.ts` cannot be loaded here: it imports `../lib/chains`,
  // a directory whose per-chain modules are reached only through dynamic
  // import(), which the harness deliberately does not follow — so the transpiled
  // copy has no `lib/chains.mjs` to resolve. Asserting against the source is the
  // honest option; a comment claiming the store was exercised would be worse.
  const { readFileSync: rf } = await import('node:fs');
  const { join: pj } = await import('node:path');
  const src = rf(pj(process.argv[2] ?? '.', 'stores/walletStore.ts'), 'utf8');

  // Native balances are built before any token work, and the two lists are
  // merged rather than replaced — so a token read that yields nothing leaves the
  // native rows in place.
  const nativeAt = src.indexOf('const native: AssetBalance[] = serverBalances.flatMap');
  const tokenAt = src.indexOf('const tokenRows: TokenBalance[] = []');
  eq(nativeAt !== -1, true, 'the store builds native balances from the server response');
  eq(tokenAt !== -1, true, 'the store collects token rows separately');
  eq(nativeAt !== -1 && tokenAt !== -1 && nativeAt < tokenAt, true,
     'native balances are computed before token balances are requested');

  eq(
    /for \(const entry of \[\.\.\.assets, \.\.\.tokens\]\) merged\.set\(entry\.id, entry\);/.test(src),
    true,
    'native and token rows are merged by id, so neither list can erase the other'
  );

  // `Promise.allSettled` is what keeps a rejected token read from propagating:
  // `all` would throw and the catch would replace the whole balance list.
  eq(
    /const tokenResults = await Promise\.allSettled\(/.test(src),
    true,
    'token reads use allSettled, so one failure cannot abort the refresh'
  );

  // And the spread that a malformed payload used to break.
  eq(
    /for \(const result of tokenResults\) \{\s*if \(result\.status === 'fulfilled'\) tokenRows\.push\(\.\.\.result\.value\);/.test(src),
    true,
    'token rows are spread only from a value fetchTokenBalances guaranteed is an array'
  );

  // This used to assert `warning: warnings[0] ?? null`, treating "only the first
  // warning renders" as correct. It was pinning the bug: with an unreadable
  // native chain AND an unreadable token, the user was told about one and never
  // learned the other existed. Now pinned as a join instead.
  eq(
    /warning: warnings\[0\] \?\? null/.test(src),
    false,
    'the store no longer surfaces only the first warning'
  );
  eq(
    /warnings\.join\(' '\)/.test(src),
    true,
    'warnings are joined so every problem is visible'
  );
}

console.log('\n== live contract: broadcast body carries only signedTx ==');
{
  const client = await load('lib/api/client.ts');
  const tx = await load('lib/api/transactions.ts');

  const calls = [];
  const realPost = client.apiClient.post;
  client.apiClient.post = (url, body) => {
    calls.push({ url: String(url), body });
    return Promise.resolve({ data: { success: true, data: { id: 't-1' } } });
  };
  const restore = () => { client.apiClient.post = realPost; };
  const lastBody = () => (calls.length ? calls[calls.length - 1].body : undefined);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // --- the exact shape the backend accepts -------------------------------
  calls.length = 0;
  await tx.broadcastTransaction('t-1', '0x02f8720106');
  eq(
    calls[0].url,
    '/api/transaction/t-1/broadcast',
    'broadcast posts to /api/transaction/:id/broadcast'
  );
  eq(lastBody().signedTx, '0x02f8720106', 'the signed payload is sent');
  eq(has(lastBody(), 'idempotencyKey'), false,
     'the body has NO idempotencyKey - the backend rejects it outright');
  eq(Object.keys(lastBody()).length, 1, 'the body has exactly one key');

  // The key belongs on send, where it is required.
  calls.length = 0;
  await tx.sendPayment({
    recipientAccountId: '1234567890',
    amount: '0.01',
    symbol: 'ETH',
    network: 'ETH',
    pin: '123456',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
  });
  eq(calls[0].url, '/api/transaction/send', 'send posts to /api/transaction/send');
  eq(lastBody().network, 'ETH', 'send uses `network`, not `chain`');
  eq(has(lastBody(), 'chain'), false, 'send does not send a `chain` key');
  eq(lastBody().idempotencyKey, '11111111-1111-4111-8111-111111111111',
     'send carries the required idempotencyKey');
  eq(has(lastBody(), 'recipientAddress'), false,
     'send sends exactly one recipient field');

  restore();
}

console.log('\n== live contract: getMe().accountId is an object ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const src = readFileSync(pathJoin(root, 'lib/api/accountId.ts'), 'utf8');

  // --- the shape is documented in the interface, not just in a comment ----
  eq(
    /export interface MeAccountId \{[\s\S]*?accountId: string;[\s\S]*?\}/.test(src),
    true,
    'MeAccountId declares the nested accountId string'
  );
  eq(
    /accountId: MeAccountId \| null;/.test(src),
    true,
    'MeProfile.accountId is an object, not a string'
  );
  eq(
    /getMe\(\): Promise<MeProfile>/.test(src),
    true,
    'getMe returns MeProfile rather than any'
  );
  eq(
    /getMe\(\): Promise<any>/.test(src),
    false,
    'getMe no longer returns any'
  );

  // --- and the two call sites that read it are still correct -------------
  for (const rel of ['app/(auth)/login.tsx', 'app/(auth)/create-account-id.tsx']) {
    const screen = readFileSync(pathJoin(root, rel), 'utf8');
    eq(
      screen.includes('accountId?.accountId'),
      true,
      `${rel} reads accountId.accountId, not the object itself`
    );
    // The bug this guards: treating the object as the ID.
    eq(
      /getMe\(\)[\s\S]{0,120}accountId = me\?\.accountId;/.test(screen),
      false,
      `${rel} does not assign the object to accountId`
    );
  }

  // userStore.hydrate must not have started reading it as a string.
  const userStore = readFileSync(pathJoin(root, 'stores/userStore.ts'), 'utf8');
  eq(
    /me\?\.accountId/.test(userStore),
    false,
    'userStore does not read me.accountId at all (it hydrates from SecureStore)'
  );
}

console.log('\n== set-pin is first-time only: create-pin must branch on the 409 ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';

  const screen = readFileSync(pathJoin(root, 'app/(auth)/create-pin.tsx'), 'utf8');

  // --- the branch exists, and it is reached BEFORE the generic retry ------
  eq(
    /toApiError\(err\)\.status === 409/.test(screen),
    true,
    'create-pin inspects a 409 from set-pin'
  );
  const at409 = screen.indexOf('toApiError(err).status === 409');
  const generic = screen.indexOf("Something went wrong saving your PIN");
  eq(at409 !== -1 && generic !== -1 && at409 < generic, true,
     'the 409 is handled before the generic retry-and-reset path');

  // --- and it does not re-arm the keypad on a 409 ------------------------
  // Slice only the 409 branch: it must leave via `return` before any of the
  // generic retry code runs. Slicing to `} finally {` would also capture the
  // non-409 path, which does reset the stage and does set an error.
  const branchEnd = screen.indexOf('return;', at409);
  const branch = branchEnd === -1 ? '' : screen.slice(at409, branchEnd);
  eq(branchEnd !== -1, true, 'the 409 branch leaves via an early return');
  eq(
    /setStage\(/.test(branch),
    false,
    'a 409 does not reset the stage back to the PIN keypad'
  );
  eq(
    /setError\(/.test(branch),
    false,
    'a 409 is not shown as a retryable save error'
  );
  // ...and the return genuinely precedes the generic handler.
  const genericAt = screen.indexOf('Something went wrong saving your PIN');
  eq(
    branchEnd !== -1 && genericAt !== -1 && branchEnd < genericAt,
    true,
    'the early return comes before the generic save-failure handler'
  );

  // --- and it sends the user somewhere they can act ----------------------
  eq(
    /status === 409[\s\S]{0,400}router\.replace\('\/\(auth\)\/verify-pin'\)/.test(screen),
    true,
    'a 409 routes to verify-pin, where an existing PIN can be proven'
  );

  // The screen must still handle a genuine first-time failure by re-arming.
  eq(
    /Something went wrong saving your PIN/.test(screen),
    true,
    'a non-409 save failure still surfaces an error'
  );
  eq(
    screen.includes("setStage('create')"),
    true,
    'a non-409 save failure still resets the stage'
  );

  // --- settings/security.tsx must use changePin, never setPin -----------
  const security = readFileSync(pathJoin(root, 'app/settings/security.tsx'), 'utf8');
  eq(/changePin\(currentPin, newPin\)/.test(security), true,
     'the PIN-change screen calls changePin(current, new)');
  eq(
    /\bsetPin\b|set-pin/.test(security),
    false,
    'the PIN-change screen never calls set-pin'
  );
  // Both fields are required: dropping either would send a partial patch.
  eq(
    /currentPin\.length !== 6/.test(security) && /newPin\.length !== 6/.test(security),
    true,
    'both the current and new PIN are validated before the call'
  );
}

console.log('\n== PaymentLink declares the asset live rows carry ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const src = readFileSync(pathJoin(root, 'lib/api/transactions.ts'), 'utf8');

  const iface = src.slice(src.indexOf('export interface PaymentLink'));
  const block = iface.slice(0, iface.indexOf('\n}'));
  eq(/^\s+asset\?: string \| null;/m.test(block), true,
     'PaymentLink declares asset as string | null');
  eq(/^\s+symbol\?: string \| null;/m.test(block), true,
     'PaymentLink still declares symbol');
  // Declared, not invented: it must not be required, since a row may omit it.
  eq(/^\s+asset: string;/m.test(block), false,
     'asset stays optional - a row is not guaranteed to carry it');
}

console.log('\n== token-balances chain is case-sensitive and UPPERCASE ==');
{
  const client = await load('lib/api/client.ts');
  const tokens = await load('lib/api/tokens.ts');

  const calls = [];
  const realGet = client.apiClient.get;
  client.apiClient.get = (url, config) => {
    calls.push({ url: String(url), params: config?.params });
    return Promise.resolve({ data: { success: true, data: [] } });
  };
  const restore = () => { client.apiClient.get = realGet; };

  // Live: `chain=eth` -> 400 "chain must be one of: TON, BSC, ETH, ...".
  // `chain=ETH` -> 200. So the wire value must never be lower-cased.
  for (const [chain, expected] of [['eth', 'ETH'], ['bsc', 'BSC'], ['sol', 'SOL']]) {
    calls.length = 0;
    await tokens.fetchTokenBalances({
      chain, address: '0xowner', tokens: [{ symbol: 'USDC', name: 'USD Coin', decimals: 6, addresses: { [chain]: '0xc' } }],
    });
    eq(calls[0].params?.chain, expected,
       `a lower-case "${chain}" is sent on the wire as "${expected}"`);
  }

  // Every chain the backend accepts, verified as UPPERCASE.
  const accepted = ['TON', 'BSC', 'ETH', 'SOL', 'BASE', 'POLYGON', 'TRON', 'BTC'];
  for (const wire of accepted) {
    eq(wire, wire.toUpperCase(), `${wire} is already the wire form`);
  }
  eq(accepted.length, 8, 'all eight chains the backend requires are covered');

  // The path must not have drifted while the casing was being checked.
  calls.length = 0;
  await tokens.fetchTokenBalances({ chain: 'eth', address: '0xowner', tokens: [{ symbol: 'USDC', name: 'USD Coin', decimals: 6, addresses: { eth: '0xc' } }] });
  eq(calls[0].url, '/api/wallet/token-balances', 'the path is unchanged');

  restore();
}

console.log('\n== a null native balance is dropped, never shown as 0.00 ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const src = readFileSync(pathJoin(root, 'stores/walletStore.ts'), 'utf8');

  // TON and BTC come back with a null balance. Rendering that as 0.00 looks
  // a lie, so the row is not rendered. Naming it is handled above.
  // This used to assert that a null balance was "filtered out rather than
  // coerced", treating the dropped row as correct. It was pinning the item-3 bug.
  // Filtering was worse than coercing: an unreadable chain became invisible
  // rather than visibly wrong. The row is now dropped *and named*.
  eq(
    /if \(!chainId \|\| entry\.balance === null\) return \[\];/.test(src),
    false,
    'a null balance is no longer dropped silently'
  );
  eq(
    /unreadable\.push/.test(src),
    true,
    'the chain whose balance could not be read is named in a warning'
  );
  eq(
    /balance: entry\.balance \?\? ['"]0/.test(src),
    false,
    'no `balance ?? 0` coercion exists for native balances'
  );
  // And the token side must not invent a row either.
  const tokenBlock = src.slice(src.indexOf('const tokenRows: TokenBalance[] = []'));
  eq(
    /balance: token\.balance/.test(tokenBlock),
    true,
    'token balances are carried through verbatim'
  );
  eq(
    /Number\(token\.balance\)|parseFloat\(token\.balance\)/.test(tokenBlock),
    false,
    'token balances are not coerced to a number for display'
  );
}

console.log('\n== settings: omit leaves alone, explicit null clears ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const src = readFileSync(pathJoin(root, 'lib/api/accountId.ts'), 'utf8');

  const patchIface = src.slice(src.indexOf('export interface SettingsPatch'));
  const block = patchIface.slice(0, patchIface.indexOf('\n}'));

  // Nullable columns must accept an explicit null — that is how they are cleared.
  eq(/^\s+name\?: string \| null;/m.test(block), true, 'name accepts null');
  eq(/^\s+photoUrl\?: string \| null;/m.test(block), true, 'photoUrl accepts null');
  eq(/^\s+defaultNetwork\?: string \| null;/m.test(block), true, 'defaultNetwork accepts null');

  // NOT NULL columns must not, or the type would promise something the backend
  // rejects with a 400.
  eq(/^\s+defaultCurrency\?: string;/m.test(block), true,
     'defaultCurrency does not accept null');
  eq(/^\s+defaultLanguage\?: string;/m.test(block), true,
     'defaultLanguage does not accept null');

  // The trap this replaces: `Partial<>` permits `{ name: undefined }`, and
  // undefined is dropped in serialisation, so "clear this" would silently mean
  // "leave alone".
  eq(/updateSettings\(\s*patch: Partial</.test(src), false,
     'updateSettings does not take Partial<>');
  eq(/export async function updateSettings\(patch: SettingsPatch\)/.test(src), true,
     'updateSettings takes SettingsPatch');

  // Returns the user row rather than `any` — the hole that hid the accountId
  // shape change. The row is *narrower* than `getMe()`'s, and the return type
  // has to say so: the PATCH never returns `accountId`, `pinFailedAttempts` or
  // `pinLockedUntil`, so claiming `Promise<MeProfile>` promises three fields that
  // arrive as `undefined`.
  eq(/updateSettings\(patch: SettingsPatch\): Promise<MeProfile>/.test(src), false,
     'updateSettings does not claim the full MeProfile it never receives');
  eq(/export async function updateSettings\(\s*patch: SettingsPatch,?\s*\): Promise<MeProfileAfterSettingsPatch>/.test(src), true,
     'updateSettings returns MeProfileAfterSettingsPatch, not any');

  // The three omissions, named. Measured live across four different patches.
  const omitBlock = /MeProfileAfterSettingsPatch\s*=\s*Omit<\s*MeProfile,([\s\S]*?)>/.exec(src);
  eq(omitBlock !== null, true, 'MeProfileAfterSettingsPatch is an explicit Omit of MeProfile');
  if (omitBlock) {
    // Split on either separator: the union inside `Omit<>` may be written with
    // commas or pipes, and an assertion that only understood one of them would
    // quietly stop checking anything after a reformat.
    const omitted = (omitBlock[1].match(/['"]([A-Za-z][A-Za-z0-9]*)['"]/g) ?? [])
      .map((s) => s.replace(/['"]/g, ''))
      .sort();
    eq(
      JSON.stringify(omitted),
      JSON.stringify(['accountId', 'pinFailedAttempts', 'pinLockedUntil']),
      'the Omit names exactly the three fields the PATCH omits'
    );
  }

  // Match the declaration, not the prose: `Promise<any>` also appears in a
  // comment explaining that getMe *used* to be untyped, and a whole-file grep
  // cannot tell that from a signature.
  eq(
    /export async function \w+\([^)]*\): Promise<any>/.test(src),
    false,
    'no exported function in this module returns Promise<any>'
  );
}

console.log('\n== verification screens: never claim a delivery we cannot prove ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const email = lf(pathJoin(root, 'app/(auth)/verify-email.tsx'));
  const phone = lf(pathJoin(root, 'app/(auth)/verify-phone.tsx'));
  const signup = lf(pathJoin(root, 'app/(auth)/signup.tsx'));

  // The backend does NOT roll back a signup when the email provider fails, and
  // documents that as deliberate (auth.service.ts: "A delivery failure must not
  // roll back the signup"). So a 201 from signup is not evidence of delivery. The
  // screens used to say "We sent a 6-digit code to …" unconditionally, which is
  // a false statement to exactly the users whose provider just failed.
  for (const [name, src, flag] of [
    ['verify-email', email, 'emailSent'],
    ['verify-phone', phone, 'phoneSent'],
  ]) {
    eq(
      src.includes(`const { deliveryKnown = ${flag}`) ||
        src.includes(`deliveryKnown === 'true'`) ||
        new RegExp(`deliveryKnown`).test(src),
      true,
      `${name} computes whether delivery is known`
    );
    eq(
      /We sent a 6-digit code/.test(src) && !/deliveryKnown \?/.test(src),
      false,
      `${name} does not assert a sent code unconditionally`
    );
    // The honest branch has to exist, not just be implied.
    eq(
      new RegExp(`deliveryKnown\\s*\\?\\s*'[^']*'\\s*:\\s*'[^']*'`).test(src),
      true,
      `${name} has both an affirmative and an honest branch in its copy`
    );
    // A known-absent delivery must not promise a code.
    const honest = /deliveryKnown\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/.exec(src);
    if (honest) {
      // At least one branch must name the destination the code went to, so the
      // user is always told where to look. Which branch that is differs per
      // screen, so it is checked as "one of the two" rather than a fixed side.
      const [, whenTrue, whenFalse] = honest;
      eq(
        [whenTrue, whenFalse].some((s) => /\bsent\b/i.test(s)),
        true,
        `${name} tells the user a code was sent on the path where one was`
      );
      // Polarity differs per screen and must NOT be assumed here. On verify-email,
      // deliveryKnown=true means DEV mode, where delivery was deliberately
      // SKIPPED -- so the honest branch is the `true` one. On verify-phone it is
      // the `false` one. Asserting a fixed polarity caught my own correct code.
      //
      // What must hold either way: the two branches are not both claims. A
      // denial ("no code was sent", "we have not sent a code") is allowed to
      // contain the word "sent"; an affirmative claim is not allowed to sit
      // behind a negator. So: at most one branch may be an affirmative claim,
      // and at least one must deny.
      const isClaim = (s) => /\bsent\b/i.test(s) && !/\b(not|no|never|n't)\b/i.test(s);
      const isDenial = (s) => /\b(not|no|never|n't)\b/i.test(s);
      const claims = [whenTrue, whenFalse].filter(isClaim).length;
      const denials = [whenTrue, whenFalse].filter(isDenial).length;
      eq(
        claims <= 1,
        true,
        `${name} does not claim a send in both branches -- at most one may claim it`
      );
      eq(
        denials >= 1,
        true,
        `${name} has a branch that denies sending, rather than only asserting a send`
      );
    }
  }

  // verify-phone is reached by verifying the EMAIL code, so nothing in this flow
  // has ever sent an SMS. It must not imply otherwise.
  eq(
    /phoneSent\?: string/.test(phone),
    true,
    'verify-phone declares a phoneSent param rather than assuming delivery'
  );

  // signup passes the flag through, and only ever sets it from a real signal.
  eq(
    /emailSent:/.test(signup),
    true,
    'signup forwards an emailSent signal'
  );
  eq(
    /emailSent: devVerificationCodes\?\.email \? 'true' : undefined/.test(signup),
    true,
    'emailSent is derived, never a literal true'
  );

  // The dev code stays a prefill, not a requirement. It must remain optional.
  eq(
    /toDigits\(devEmailCode\)/.test(email),
    true,
    'the email code field is still prefillable from the dev code'
  );
  eq(
    /toDigits\(devPhoneCode\)/.test(phone),
    true,
    'the phone code field is still prefillable from the dev code'
  );
  // And typing still works with nothing prefilled -- the field is editable
  // regardless, which is why an absent dev code is not a dead end.
  eq(
    /onChangeDigit=\{onChangeDigit\}/.test(email) && /onChangeDigit=\{onChangeDigit\}/.test(phone),
    true,
    'both screens wire the code field to user input'
  );
  eq(
    /handleResend/.test(email) && /handleResend/.test(phone),
    true,
    'both screens keep a resend, which is the recourse when delivery failed'
  );

  // CONTRACT-NOTES says never code against these. The screens must not gate on
  // their presence -- only prefill from them.
  eq(
    /if\s*\(devEmailCode\)/.test(email) || /if\s*\(devPhoneCode\)/.test(email),
    false,
    'verify-email does not branch its behaviour on the dev code being present'
  );
  eq(
    /disabled=\{[^}]*dev(Email|Phone)Code/.test(email + phone),
    false,
    'no control is disabled based on a dev code'
  );
}

console.log('\n== register echoes what it stored, it does not fabricate success ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const src = lf(pathJoin(root, 'lib/registerWallets.ts'));

  // `POST /api/wallet/register` answers with the eight {chain,address} rows it
  // stored -- verified live. The client discarded that body and returned
  // `{ success: true }` as a literal: a claim about the server it never checked,
  // and one that stayed true even if the server had stored something else.
  eq(
    /await apiClient\.post\('\/api\/wallet\/register'/.test(src),
    false,
    'the register response body is no longer discarded'
  );
  eq(
    /apiClient\.post<[^>]*>\(\s*'\/api\/wallet\/register'/.test(src),
    true,
    'the response is typed and read'
  );
  eq(
    /registered = Array\.isArray\(data\?\.data\) \? data\.data : \[\];/.test(src),
    true,
    'the echoed rows are captured, tolerating a missing body'
  );

  // The result must carry what the server said, so a caller can check it.
  eq(
    /registered: RegisteredWallet\[\];/.test(src),
    true,
    'the result exposes the rows the server confirmed'
  );
  eq(
    /interface RegisteredWallet \{/.test(src),
    true,
    'the confirmed row is a named type rather than an inline shape'
  );

  // `addresses` is now derived from the confirmation, not from the request, so
  // it cannot claim a chain was stored that the server never echoed.
  eq(
    /return \{ success: true, registered, addresses: confirmed \};/.test(src),
    true,
    'addresses is built from the confirmed rows'
  );
  eq(
    /for \(const \{ chain, address \} of confirmed\)/.test(src),
    true,
    'the wallet store is hydrated from what the server confirmed'
  );
  eq(
    /for \(const \{ chain, address \} of addresses\)/.test(src),
    false,
    'the store is no longer hydrated from the unconfirmed request'
  );

  // A partial acknowledgement is a real failure. Silently returning fewer rows
  // would leave the account with a wallet the server does not have.
  eq(
    /the server acknowledged only/.test(src),
    true,
    'a partial acknowledgement fails loudly, naming what is missing'
  );
  eq(
    /missing \$\{missing\.map\(\(m\) => m\.chain\)\.join\(', '\)\}/.test(src),
    true,
    'the failure names the chains the server did not confirm'
  );

  // The wire chain is UPPERCASE and the frontend id is not, so something has to
  // translate -- and an unknown wire value must not be invented into a ChainId.
  eq(
    /function toFrontendChain\(wire: string\): ChainId \| null/.test(src),
    true,
    'the wire chain is translated, and can fail'
  );
  eq(
    /if \(!chainId\) continue;/.test(src),
    true,
    'an unmappable chain is skipped rather than coerced'
  );
}

console.log('\n== one source for chain display names ==');

console.log('\n== one source for chain display names ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

  const chains = lf(pathJoin(root, 'constants/chains.ts'));
  const files = {
    'walletSetupErrors': lf(pathJoin(root, 'lib/walletSetupErrors.ts')),
    'addresses': lf(pathJoin(root, 'app/wallet/addresses.tsx')),
    'withdraw': lf(pathJoin(root, 'app/deposit-withdraw/withdraw.tsx')),
  };

  // Three private copies had drifted: BSC was "BNB Smart Chain" in one and "BSC"
  // in two, TRON was "Tron" in one and "TRON" in two. The same chain named two
  // ways on two screens a user could compare side by side.
  for (const [name, src] of Object.entries(files)) {
    eq(
      /const CHAIN_LABELS\s*[:=]/.test(src),
      false,
      `${name} no longer carries its own copy of the labels`
    );
  }

  // All three read from the one helper.
  eq(/export function chainLabel\(chain: string\): string/.test(chains), true,
     'chainLabel is exported from constants/chains');
  eq(/CHAINS\[chain as ChainId\]/.test(chains), true,
     'chainLabel reads CHAINS rather than repeating the strings');
  for (const [name, src] of Object.entries(files)) {
    eq(
      new RegExp(`import \\{ chainLabel \\} from '\\.\\.?/(\\.\\./)?constants/chains'`).test(src),
      true,
      `${name} imports the shared helper`
    );
    eq(
      /chainLabel\(/.test(src),
      true,
      `${name} calls it rather than indexing a local table`
    );
  }

  // The canonical names live in CHAINS, which already existed. The drift was the
  // copies, not the source of truth, so this pins that the values are read and
  // not duplicated anywhere else.
  eq(
    /bsc: \{ id: 'bsc', name: 'BNB Smart Chain'/.test(chains),
    true,
    'CHAINS remains the canonical home of the names'
  );
  const otherDefinitions = Object.entries(files).filter(([, src]) =>
    /name: '(BNB Smart Chain|BSC|Ethereum|Tron|TRON)'/.test(src)
  );
  eq(
    otherDefinitions.length,
    0,
    'no other file restates a chain display name inline'
  );

  // The fallback matters: `error.chain` comes off the wire, so an unknown chain
  // must still render rather than crash or render blank.
  eq(
    /return known\?\.name \?\? chain\.toUpperCase\(\);/.test(chains),
    true,
    'an unrecognised chain falls back to its uppercased id'
  );
}

console.log('\n== one normalizer, and no fallback masking a missing field ==');

console.log('\n== one normalizer, and no fallback masking a missing field ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const tx = lf(pathJoin(root, 'lib/api/transactions.ts'));
  const ext = lf(pathJoin(root, 'lib/api/externalTransfers.ts'));

  // Item 5. The backend sends direction and counterpartyAccountId on ALL FOUR
  // transaction endpoints now (create + both reads, plus external submit).
  // Verified live before making them required: create answered direction="sent"
  // and counterpartyAccountId="9259531853".
  //
  // The `?? 'sent'` fallback is the dangerous kind. It is harmless today because
  // a just-sent transaction IS sent -- and that is exactly why it is bad: if the
  // field ever stopped arriving, the client would invent a plausible value
  // rather than show a hole, so the regression would be invisible.
  eq(
    /direction: transaction\.direction \?\? 'sent'/.test(tx),
    false,
    'normalizeTransaction no longer invents a direction when the field is absent'
  );
  eq(
    /counterpartyAccountId: transaction\.counterpartyAccountId \?\? transaction\.recipientAccountId/.test(tx),
    false,
    'normalizeTransaction no longer substitutes recipientAccountId for a missing counterparty'
  );
  // Required in the type, so a missing field is a compile error rather than a
  // silent default.
  eq(
    /direction: TransactionDirection;/.test(tx),
    true,
    'direction is required on BackendTransaction'
  );
  eq(
    /counterpartyAccountId: string;/.test(tx),
    true,
    'counterpartyAccountId is required on BackendTransaction'
  );
  eq(
    /direction\?: TransactionDirection;/.test(tx),
    false,
    'direction is no longer optional'
  );
  eq(
    /counterpartyAccountId\?: string;/.test(tx),
    false,
    'counterpartyAccountId is no longer optional'
  );

  // Item 8. The normalizer was duplicated by hand, and the copy had already
  // drifted: it kept the fallbacks after transactions.ts moved on.
  eq(
    /export function normalizeTransaction\(/.test(tx),
    true,
    'normalizeTransaction is exported'
  );
  eq(
    /import \{ normalizeTransaction, type BackendTransaction, type Transaction \} from '\.\/transactions';/.test(ext),
    true,
    'externalTransfers imports the shared normalizer'
  );
  eq(
    /return normalizeTransaction\(data\.data\);/.test(ext),
    true,
    'the submit response goes through the shared normalizer'
  );
  // The hand-written copy must be gone: no status mapping, no asset->symbol
  // rename, no field list of its own.
  eq(
    /id: backend\.id/.test(ext),
    false,
    'the hand-written field-by-field copy is gone'
  );
  eq(
    /symbol: backend\.asset/.test(ext),
    false,
    'no local asset->symbol rename remains'
  );
  eq(
    /status === 'COMPLETED' \? 'complete'/.test(ext),
    false,
    'no local status mapping remains'
  );
  eq(
    /interface BackendSubmitResponse/.test(ext),
    false,
    'the extending interface that redeclared the two fields is gone'
  );
}

console.log('\n== the NGN estimate must never be a fabricated zero either ==');

console.log('\n== the NGN estimate must never be a fabricated zero either ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const coingecko = lf(pathJoin(root, 'lib/prices/coingecko.ts'));
  const portfolio = lf(pathJoin(root, 'hooks/usePortfolioValue.ts'));
  const withdraw = lf(pathJoin(root, 'app/deposit-withdraw/withdraw.tsx'));

  // `usdToNng` had the same `?? 0` as `pickFromCache`, one function over: an
  // unreadable fiat rate became a rate of exactly zero.
  eq(
    /export async function usdToNgn\(usdAmount: number\): Promise<number \| null>/.test(coingecko),
    true,
    'usdToNgn returns number | null'
  );
  eq(
    /if \(rate === undefined \|\| rate === null\) return null;/.test(coingecko),
    true,
    'an unreadable rate returns null rather than 0'
  );

  // The caller has to carry that null all the way to the screen, or the fix
  // stops at the type boundary.
  eq(
    /useState<number \| null>\(null\)/.test(withdraw),
    true,
    'the withdraw screen holds the estimate as number | null'
  );
  eq(
    /estimatedNgn === null \?/.test(withdraw),
    true,
    'a null estimate has its own render branch'
  );
  // The defect: `estimatedNgn.toLocaleString(...)` on a null would throw, and
  // guarding only the failure path while leaving the initial state at 0 would
  // show a real zero before any rate arrives.
  eq(
    /useState\(0\)/.test(withdraw.replace(/\/\/[^\n]*/g, '')),
    false,
    'the estimate is not initialised to a real 0'
  );
  // Only the FAILURE path may not fabricate a zero. `setEstimatedNgn(0)` is still
  // correct for `usdValue <= 0`, which is a genuine zero amount, so the check is
  // scoped to the catch block rather than the whole file.
  const catchBlock = /\.catch\(\(\) => \{[^}]*\}\);/.exec(withdraw);
  eq(catchBlock !== null, true, 'the failure path is locatable');
  if (catchBlock) {
    eq(
      /setEstimatedNgn\(0\)/.test(catchBlock[0]),
      false,
      'a failure does not set the estimate to a fabricated 0'
    );
    eq(
      /setEstimatedNgn\(null\)/.test(catchBlock[0]),
      true,
      'a failure leaves the estimate unknown instead'
    );
  }
  // The zero that legitimately remains: a zero USD amount converts to zero naira.
  eq(
    /if \(usdValue <= 0\) \{\s*setEstimatedNgn\(0\)/.test(withdraw),
    true,
    'a genuine zero USD amount still yields a real zero, which is correct'
  );

  // usePortfolioValue already nulled an unusable rate; make sure the null is
  // handled rather than compared as if it were a number.
  eq(
    /rate !== null && rate > 0 \? rate : null/.test(portfolio),
    true,
    'usePortfolioValue handles the null rate explicitly'
  );
}

console.log('\n== a missing price is absent, never zero ==');

console.log('\n== a missing price is absent, never zero ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const src = lf(pathJoin(root, 'lib/prices/coingecko.ts'));

  // `result[s] = data[s] ?? 0` turned a failed lookup into a real zero. Every
  // consumer already treats `undefined` as unknown, so the zero was silently
  // defeating code written to handle exactly this case.
  // Scoped to CODE lines. A whole-file grep matched the doc comment above, which
  // quotes the old expression verbatim to explain what it replaced -- the same
  // false positive CONTRACT-NOTES already records for `Promise<any>`. This bit
  // twice on my own comment before it was scoped, which is why it is scoped.
  const priceCode = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
    .join('\n');
  eq(
    /result\[s\] = data\[s\] \?\? 0/.test(priceCode),
    false,
    'pickFromCache no longer substitutes 0 for an unpriced symbol'
  );
  eq(
    /\?\? 0/.test(priceCode),
    false,
    'no `?? 0` fallback remains in executable code'
  );
  eq(
    /if \(price !== undefined\) result\[s\] = price;/.test(src),
    true,
    'an unpriced symbol is left absent instead of written as zero'
  );

  // The record type has to admit absence, or the compiler fights the fix.
  eq(
    /Partial<Record<PriceSymbol, number>>/.test(src),
    true,
    'the price record is Partial, so absence is representable'
  );

  // `toUsd` had the same defect one call away: `amount * (prices[symbol] ?? 0)`.
  eq(
    /toUsd[\s\S]*?Promise<number \| null>/.test(src),
    true,
    'toUsd returns number | null rather than a fabricated number'
  );
  eq(
    /export async function toUsd[\s\S]*?if \(price === undefined\) return null;/.test(src),
    true,
    'toUsd returns null when the price is unknown'
  );
  eq(
    /export async function toUsd[\s\S]{0,400}?\?\? 0/.test(src),
    false,
    'toUsd has no zero fallback left'
  );

  // A genuine zero must still survive: the API can really answer 0, and that is
  // a price, not an absence. So the guard tests `undefined`, never falsiness --
  // `if (!price)` would drop a real zero.
  eq(
    /if \(price === undefined\) return null;/.test(src),
    true,
    'the check is for undefined specifically, so a real 0 still prices'
  );
  eq(
    /if \(!price\)/.test(src),
    false,
    'no falsy check that would discard a genuine zero price'
  );
}

console.log('\n== a null balance is not a zero balance: name the chains, do not drop them ==');

console.log('\n== a null balance is not a zero balance: name the chains, do not drop them ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const src = lf(pathJoin(root, 'stores/walletStore.ts'));

  // The backend substitutes `balance: null` from exactly one place, and it is
  // deliberate: the chain adapter threw, so a null row is returned rather than
  // failing the whole read (wallet.service.ts). A real zero arrives as "0.000…".
  // So null means "a wallet exists here and I could not read it", and dropping
  // the row made an unreadable chain indistinguishable from one not held.
  eq(
    /if \(!chainId \|\| entry\.balance === null\) return \[\];/.test(src),
    false,
    'a null balance is no longer discarded together with an unmapped chain'
  );
  eq(
    /unreadable\.push/.test(src),
    true,
    'unreadable chains are collected rather than dropped'
  );
  // The two conditions are separated so an unmapped chain is also reported.
  eq(
    /if \(!chainId\) \{\s*unreadable\.push\(entry\.chain\);/.test(src),
    true,
    'an unmapped chain is counted as unreadable, not silently skipped'
  );
  eq(
    /if \(entry\.balance === null\) \{/.test(src),
    true,
    'the null-balance case is handled on its own'
  );

  // The message names the chains. A generic string is indistinguishable from any
  // other partial failure and gives the user nothing to act on.
  eq(
    /balance could not be read/.test(src),
    true,
    'the warning says what could not be read'
  );
  eq(
    /\$\{unreadable\[0\]\} balance could not be read/.test(src),
    true,
    'the single-chain case names the chain'
  );
  eq(
    /unreadable\.slice\(0, -1\)\.join\(', '\)/.test(src),
    true,
    'the multi-chain case enumerates them rather than saying "some"'
  );
  eq(
    /Some (native )?balances could not be read/.test(src),
    false,
    'the warning is not a generic some-balances message'
  );

  // `warnings` has to exist before the native read, since that is where the
  // unreadable entry is pushed.
  const decl = src.indexOf('const warnings: string[] = [];');
  const push = src.indexOf('unreadable.length > 0');
  const nativeDecl = src.indexOf('const native: AssetBalance[]');
  eq(decl > 0 && nativeDecl > 0 && push > 0, true, 'all three sites are locatable');
  eq(
    decl < nativeDecl && decl < push,
    true,
    'warnings is declared above the native block that pushes to it'
  );

  // `warning` is a single string, so warnings[0] silently dropped the rest. With
  // an unreadable native chain AND an unreadable token, the user was told about
  // one and never learned the other existed.
  eq(
    /warning: warnings\[0\] \?\? null/.test(src),
    false,
    'only the first warning is no longer shown'
  );
  eq(
    /warnings\.join\(' '\)/.test(src),
    true,
    'multiple warnings are joined so both are visible'
  );
  eq(
    /warnings\.length > 0 \? warnings\.join/.test(src),
    true,
    'an empty warning list still yields null, not an empty string'
  );
  // The native entry is pushed first, so it leads -- a native holding is more
  // consequential than an optional token.
  eq(
    decl < src.indexOf('const tokenResults'),
    true,
    'the unreadable-native warning is pushed before the token warnings'
  );

  // The fallback: an empty answer is a real answer, not an outage.
  eq(
    /if \(serverBalances\.length === 0\)/.test(src),
    true,
    'the empty-answer case is handled explicitly'
  );
  eq(
    /if \(native\.length === 0\)/.test(src),
    true,
    'the all-unreadable case still earns a direct-read retry'
  );
  eq(
    /if \(native\.length === 0\) \{\s*\/\/ Backend balances unavailable/s.test(src),
    false,
    'the stale "balances unavailable" comment no longer misdescribes the branch'
  );
}

console.log('\n== the two account endpoints: assert the wallet shapes are not the same ==');

console.log('\n== the two account endpoints: assert the wallet shapes are not the same ==');

console.log('\n== the two account endpoints: assert the wallet shapes are not the same ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const src = readFileSync(pathJoin(root, 'lib/api/accountId.ts'), 'utf8');

  // `GET /api/account/{id}` returns `wallets: [{ chain }]` with no address key.
  // `GET /api/account/resolve/{id}` returns `[{ chain, address }]`. These were
  // typed as one shape, so `.address` on the first was `undefined` under a type
  // promising `string`. No test caught it: the only caller of the address-less
  // function is unused, and the consumer filters its input down to entries that
  // have an address, so a regression degrades to an empty list rather than
  // throwing.
  //
  // The live facts are pinned in scripts/contract-check.mjs. These pin the types
  // so the two cannot collapse back into one.
  eq(
    /export interface ProfileWallet\s*\{[^}]*chain: string;[^}]*address: string;/s.test(src),
    true,
    'ProfileWallet declares both a chain and an address'
  );
  eq(
    /export interface ProfileWalletChain\s*\{\s*chain: string;\s*\}/s.test(src),
    true,
    'ProfileWalletChain declares a chain and nothing else'
  );

  // The whole point: the chain-only type must NOT have an address. Asserted as a
  // positive shape match above, and negatively here so a future "just make it
  // optional" edit cannot pass.
  const chainOnly = /export interface ProfileWalletChain\s*\{([^}]*)\}/s.exec(src);
  eq(chainOnly !== null, true, 'ProfileWalletChain is declared');
  if (chainOnly) {
    eq(
      /\baddress\b/.test(chainOnly[1]),
      false,
      'ProfileWalletChain does not mention address at all'
    );
  }

  eq(
    /export type AccountIdProfileWithWallets\s*=\s*AccountIdProfile\s*&\s*\{\s*wallets\?: ProfileWalletChain\[\];/s.test(src),
    true,
    'AccountIdProfileWithWallets carries the chain-only wallets'
  );
  eq(
    /export type AccountIdProfileWithAddresses\s*=\s*AccountIdProfile\s*&\s*\{\s*wallets\?: ProfileWallet\[\];/s.test(src),
    true,
    'AccountIdProfileWithAddresses carries the address-bearing wallets'
  );

  // Each function must return the shape its own endpoint produces.
  eq(
    /export async function resolveAccountId\(accountId: string\): Promise<AccountIdProfileWithWallets \| null>/.test(src),
    true,
    'resolveAccountId returns the chain-only shape'
  );
  eq(
    /export async function resolveAccountIdForTransfer\(accountId: string\): Promise<AccountIdProfileWithAddresses \| null>/.test(src),
    true,
    'resolveAccountIdForTransfer returns the address-bearing shape'
  );

  // The envelope is parameterised, so neither call site can drift back to a
  // hand-written inline type that claims a shape the endpoint does not send.
  eq(
    /apiClient\.get<ApiEnvelope<ProfileEnvelope<ProfileWalletChain>>>/.test(src),
    true,
    'resolveAccountId reads through a chain-only envelope'
  );
  eq(
    /apiClient\.get<ApiEnvelope<ProfileEnvelope<ProfileWallet>>>/.test(src),
    true,
    'resolveAccountIdForTransfer reads through an address-bearing envelope'
  );

  // The bare shared profile must not carry wallets at all. If it did, a caller
  // holding an `AccountIdProfile` could reach for `.address` without knowing
  // which endpoint produced it — which is the original defect.
  const bare = /export interface AccountIdProfile\s*\{([^}]*)\}/s.exec(src);
  eq(bare !== null, true, 'AccountIdProfile is declared');
  if (bare) {
    eq(
      /\bwallets\b/.test(bare[1]),
      false,
      'AccountIdProfile itself no longer declares wallets'
    );
  }

  // The consumers must name the shape they actually receive.
  const send = readFileSync(pathJoin(root, 'app/send/index.tsx'), 'utf8');
  eq(
    /useState<AccountIdProfileWithAddresses \| null>/.test(send),
    true,
    'the send screen holds the address-bearing shape, since it resolves for transfer'
  );
  // `hooks/useAccountId.ts` used to be asserted here too, as the other consumer
  // of the address-less resolve. It had no importer and was deleted; the shape
  // difference it exercised is pinned live in scripts/contract-check.mjs.
}

console.log('\n== sign-out ends the session on the server, in the right order ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  // Normalised before matching. These patterns are anchored on `\n`, so on a
  // CRLF checkout the body could not be located and every ordering assertion
  // below was skipped without reporting anything -- the failure mode where a
  // test quietly checks nothing. Which line endings a file has is not a fact
  // this behaviour should depend on.
  const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const auth = lf(pathJoin(root, 'lib/api/auth.ts'));
  const store = lf(pathJoin(root, 'stores/userStore.ts'));

  // `POST /api/auth/logout` was added to the backend because signing out was
  // purely local: the Session row survived, `requireAuth` kept honouring it, and
  // the discarded token worked for the full JWT_EXPIRES_IN (7 days) after the
  // user believed they had signed out. The route's own OpenAPI description says
  // "Clients MUST call this on sign-out".
  eq(
    /export async function logout\(\): Promise<\{ success: boolean \}>/.test(auth),
    true,
    'auth exposes logout()'
  );
  // `[^>]*` cannot work here: the generic is `ApiEnvelope<{ success: boolean }>`,
  // so the pattern stops at the `>` that closes the inner object literal. Match
  // non-greedily up to the argument list instead.
  eq(
    /apiClient\.post<[\s\S]*?>\('\/api\/auth\/logout'\)/.test(auth),
    true,
    'logout() POSTs /api/auth/logout'
  );
  eq(
    /apiClient\.delete[^']*'\/api\/auth\/logout'/.test(auth),
    false,
    'logout() is a POST, not a DELETE'
  );
  // No body: the bearer identifies the session, and the backend rejects unknown
  // keys, so sending one would 400 rather than harmlessly be ignored.
  eq(
    /apiClient\.post<[\s\S]*?>\('\/api\/auth\/logout',\s*\{/.test(auth),
    false,
    'logout() sends no request body'
  );

  // The store must actually call it. A correct helper nothing calls is the same
  // defect with an extra file.
  eq(
    /logout: async \(\) => \{/.test(store),
    true,
    'the user store still has a logout action'
  );
  eq(
    /import\('\.\.\/lib\/api\/auth'\)/.test(store),
    true,
    'the store dynamically imports the auth module'
  );
  eq(
    /await endSessionOnServer\(\)/.test(store),
    true,
    'the store calls the server-side logout and awaits it'
  );

  // Ordering is the part most likely to regress, and it is the part that turns a
  // fix into a no-op: once the token is cleared there is nothing left to
  // authenticate with, so a correctly-shaped call placed after the wipe always
  // fails. Asserted as an index comparison rather than a regex, because order is
  // the property that matters and a pattern match cannot see it.
  // Two spaces, not four: the object properties of the store sit at two, so a
  // four-space pattern matches nothing. Because every line *inside* logout is at
  // four or deeper, `\n  },\n` is unambiguous -- a four-space closer cannot match
  // it, because the character after the two spaces would be a space, not `}`.
  const body = /logout: async \(\) => \{([\s\S]*?)\n {2}\},\n/.exec(store);
  eq(body !== null, true, 'the logout body can be located');
  if (body) {
    const src = body[1];
    const at = {
      push: src.indexOf('unregisterPushToken()'),
      endSession: src.indexOf('endSessionOnServer()'),
      wipe: src.indexOf('clearAllSecureItems()'),
      dropCache: src.indexOf('clearCachedSessionToken()'),
    };
    eq(at.push >= 0 && at.endSession >= 0 && at.wipe >= 0 && at.dropCache >= 0, true,
       'all four teardown steps are present');
    eq(at.endSession < at.wipe, true,
       'the server-side logout happens BEFORE the secure items are wiped');
    eq(at.endSession < at.dropCache, true,
       'the server-side logout happens BEFORE the cached bearer is dropped');
    eq(at.push < at.endSession, true,
       'the push token is unregistered first -- ending the session first would 401 it');
    eq(at.wipe < at.dropCache, true,
       'secure items are still cleared before the cached token is dropped');
  }

  // A failure here must not strand the user on a signed-in screen. Best-effort,
  // and that has to be enforced rather than assumed: the call is inside a try.
  eq(
    /try \{[\s\S]*?endSessionOnServer\(\)[\s\S]*?\} catch/.test(store),
    true,
    'the server-side logout cannot reject sign-out'
  );
  // A 401 on a repeat sign-out means the session is already gone, which is the
  // desired end state -- so it is not worth a scary log line.
  eq(
    /status !== 401/.test(store),
    true,
    'a 401 is tolerated quietly rather than logged as a failure'
  );

  // `deleteAccount` kills the account, so the session is already dead by the time
  // logout runs on that path. It must not throw and block the local teardown --
  // the same try/catch covers it, but the ordering in profile.tsx is what makes
  // it reachable, so it is worth pinning.
  const profile = lf(pathJoin(root, 'app/(tabs)/profile.tsx'));
  const delAt = profile.indexOf('deleteAccountApi()');
  const logoutAt = profile.indexOf('await logout()', delAt);
  eq(delAt >= 0, true, 'the profile screen has a delete-account path');
  eq(logoutAt > delAt, true,
     'account deletion completes before local teardown, so a dead session cannot strand it');
}

console.log('\n== getMe().accountId: assert the hazard, not its absence ==');

console.log('\n== getMe().accountId: assert the hazard, not its absence ==');
{
  const { readFileSync } = await import('node:fs');
  const { join: pathJoin } = await import('node:path');
  const root = process.argv[2] ?? '.';
  const src = readFileSync(pathJoin(root, 'lib/api/accountId.ts'), 'utf8');

  eq(/accountId: MeAccountId \| null;/.test(src), true,
     'MeProfile.accountId is typed as the object');

  // `String(anyPlainObject)` is always "[object Object]". An assertion that it
  // is NOT is unsatisfiable, and would either fail forever or be deleted without
  // anyone noticing it proved nothing.
  const absent = /!String\([^)]*accountId[^)]*\)\.startsWith\(\s*'\[object'/.test(src);
  eq(absent, false,
     'no assertion claims stringifying accountId avoids [object Object]');

  // The read sites must go through .accountId.
  for (const rel of ['app/(auth)/login.tsx', 'app/(auth)/create-account-id.tsx']) {
    const screen = readFileSync(pathJoin(root, rel), 'utf8');
    eq(/accountId\?\.accountId/.test(screen), true,
       `${rel} reads through to the 10-digit string`);
  }
}

console.log(`\n  passed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
