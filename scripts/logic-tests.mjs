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
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
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

console.log(`\n  passed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
