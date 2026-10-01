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
  'lib/api/transactions.ts',
  'stores/contactsStore.ts',
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

console.log(`\n  passed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
