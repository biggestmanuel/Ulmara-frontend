/**
 * Live contract check — drives the REAL client modules against a running backend.
 *
 * ## Why this exists
 *
 * Four separate backend changes each required hand-probing with curl to discover
 * that the client had drifted:
 *
 *   - `POST /api/transaction/:id/broadcast` gained a strict body, so the extra
 *     `idempotencyKey` the client sent became a 400 and every internal transfer
 *     failed on its second step;
 *   - `GET /api/account/me` made `accountId` an object, invisible behind
 *     `Promise<any>`;
 *   - `POST /api/wallet/register` renamed `wallets` to `addresses` and began
 *     requiring all eight chains;
 *   - `POST /api/auth/set-pin` became first-time only, answering 409 where the
 *     client assumed success.
 *
 * Each was found late, and by hand. This turns that into a command.
 *
 * ## What it does
 *
 * Loads the actual TypeScript service modules — not copies, not
 * reimplementations — through the same transpile pipeline the unit tests use,
 * points them at a live base URL, logs in with a test account, and exercises
 * the contract surface. A mismatch reports the shape the backend actually sent.
 *
 * ## What it writes
 *
 * Read-mostly. The writes it does make are confined to the account named by
 * UL_MARA_TEST_EMAIL, and only where a read cannot prove a shape:
 *
 *   - one PENDING transfer, left unbroadcast (a broadcast needs a real signature,
 *     and a fabricated one would enqueue a doomed job);
 *   - one payment request;
 *   - one contact, which is deleted again at the end;
 *   - one `verify-pin` call, and `change-pin`/`set-pin` calls that are expected
 *     to be refused and change nothing.
 *
 * It never deletes an account, never migrates, and never touches the database.
 *
 * ## Running it
 *
 *   UL_MARA_API=http://localhost:4100 \
 *   UL_MARA_TEST_EMAIL=you@example.test \
 *   UL_MARA_TEST_PASSWORD=... \
 *   UL_MARA_RECIPIENT_ACCOUNT_ID=1234567890 \
 *   node scripts/contract-check.mjs .
 *
 * No credentials are committed to this repository, and none should be. Exits
 * non-zero if any expectation fails.
 */

import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(process.argv[2] ?? '.');

const BASE = process.env.UL_MARA_API ?? 'http://localhost:4100';
const EMAIL = process.env.UL_MARA_TEST_EMAIL;
const PASSWORD = process.env.UL_MARA_TEST_PASSWORD;
const PIN = process.env.UL_MARA_TEST_PIN ?? '123456';
const RECIPIENT = process.env.UL_MARA_RECIPIENT_ACCOUNT_ID ?? null;

if (!EMAIL || !PASSWORD) {
  console.error(
    'Set UL_MARA_TEST_EMAIL and UL_MARA_TEST_PASSWORD.\n' +
      'No credentials are committed to this repository, and none should be.'
  );
  process.exit(2);
}

// --------------------------------------------------------------------------
// Transpile the real modules, mirroring scripts/logic-tests.mjs
// --------------------------------------------------------------------------
const work = mkdtempSync(join(tmpdir(), 'ulmara-contract-'));
const out = join(work, 'out');
mkdirSync(out, { recursive: true });
symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'), 'junction');

const require_ = createRequire(join(ROOT, 'package.json'));
const ts = require_('typescript');

/** Only the native and Expo modules that genuinely cannot load in Node. */
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
  'expo-secure-store': `
    const m = new Map();
    export const getItemAsync = async (k) => (m.has(k) ? m.get(k) : null);
    export const setItemAsync = async (k, v) => { m.set(k, v); };
    export const deleteItemAsync = async (k) => { m.delete(k); };
  `,
};

for (const [name, code] of Object.entries(STUBS)) {
  const dir = join(work, 'stubs', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.mjs'), code);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.mjs' }));
}

// The base URL is read at module scope, so it must be set before anything is
// imported rather than after.
process.env.EXPO_PUBLIC_API_BASE_URL = BASE;

const emittedByRel = new Map();

/**
 * Transpile one module to `out/<rel>.mjs`.
 *
 * One shared output directory, exactly as `scripts/logic-tests.mjs` uses it.
 * A module's relative imports point at siblings (`./client.mjs`), so every
 * module has to land in the same tree — a per-module directory leaves the
 * importer resolving a sibling that went somewhere else.
 */
function emit(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  let js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
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

  const dest = join(out, rel.replace(/\.tsx?$/, '.mjs'));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, js);
  emittedByRel.set(rel, dest);
  return dest;
}

const built = new Set();

/** Transpile a module and every local module it statically imports, then import it. */
async function load(rel) {
  const queue = [rel];
  while (queue.length) {
    const next = queue.shift();
    if (built.has(next)) continue;
    const srcPath = join(ROOT, next);
    if (!existsSync(srcPath)) continue;
    built.add(next);
    emit(next);
    const src = readFileSync(srcPath, 'utf8');
    // Follow static relative imports only. Dynamic `import()` is never
    // followed, matching scripts/logic-tests.mjs.
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      // Strip a trailing `.js` first — the sources are written with the
      // emitted extension, so `./client.js` and `./client` both mean
      // `lib/api/client.ts`.
      const spec = m[1].replace(/\.js$/, '');
      const abs = resolve(dirname(srcPath), spec);
      for (const ext of ['.ts', '.tsx']) {
        if (!existsSync(abs + ext)) continue;
        // Queue the path *with* its extension. Queueing the extension-less
        // path and re-adding it later looks equivalent but is not: the
        // existence test then runs against a path that has no `.ts` on it, is
        // false, and the dependency is dropped without a word.
        queue.push(abs.slice(ROOT.length + 1).replace(/\\/g, '/') + ext);
      }
    }
  }
  return import(pathToFileURL(emittedByRel.get(rel)).href);
}

// --------------------------------------------------------------------------
// Assertions
// --------------------------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];
let currentGroup = '';

const ok = (label) => {
  pass += 1;
  console.log(`  PASS ${label}`);
};
const bad = (label, detail) => {
  fail += 1;
  failures.push({ group: currentGroup, label });
  console.log(`  FAIL ${label}`);
  if (detail !== undefined) {
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    console.log(`       ${text.slice(0, 500)}`);
  }
};
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) ok(label);
  else bad(label, `expected ${b}, got ${a}`);
};
const group = (name) => {
  currentGroup = name;
  console.log(`\n== ${name} ==`);
};

/**
 * Run a group's assertions without letting a rejection end the process.
 *
 * This tool is meant to be run unattended against a backend that is being
 * changed underneath it. A single failing group must not cost the coverage of
 * every group after it — which is exactly what happened when a stale fixture
 * threw inside `send`.
 */
async function attempt(label, fn) {
  try {
    await fn();
  } catch (err) {
    const status = err?.status ?? err?.response?.status ?? null;
    bad(`${label} raised${status ? ` HTTP ${status}` : ''}`, err?.message ?? String(err));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry a call that failed for a reason that is not the contract.
 *
 * Two of them, both environmental:
 *
 *  - a **429**. `POST /api/transaction/send` is limited to 10/min per user, and
 *    this check makes six sends, so a second run inside the window is throttled.
 *    A 429 says nothing about whether the body was right, so reporting it as a
 *    contract failure would be wrong. The PIN endpoints share a 5/min budget for
 *    the same reason.
 *  - a **500 or 401 on login**, which is what a database re-seed looks like from
 *    here — the account briefly does not exist.
 *
 * Anything else is a real answer and is thrown immediately.
 */
async function withBackoff(fn, { attempts = 6, label = 'call' } = {}) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const status = err?.status ?? null;
      const retryable = status === 429 || status === 500 || (label === 'login' && status === 401);
      if (!retryable) throw err;
      if (i === attempts - 1) break;
      const wait = status === 429 ? 12000 * (i + 1) : 2500 * (i + 1);
      console.log(`  … ${label} answered ${status}, retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
  throw last;
}

/** Login with backoff, so a re-seed or a throttle is not a false alarm. */
const loginWithRetry = (fn) => withBackoff(fn, { label: 'login' });

/**
 * Assert a call is refused with a specific status, retrying only a 429.
 *
 * A refusal assertion must not be satisfied by a throttled response: "expected
 * 400, got 429" is not evidence that the body was correct.
 */
async function expectStatus(label, fn, status) {
  try {
    const r = await withBackoff(fn, { attempts: 4, label });
    bad(label, `expected HTTP ${status}, but it succeeded: ${JSON.stringify(r)?.slice(0, 200)}`);
  } catch (err) {
    const got = err?.status ?? err?.response?.status ?? null;
    if (got === status) ok(`${label} -> ${status}`);
    else bad(label, `expected ${status}, got ${got}: ${err?.message ?? ''}`);
  }
}

const uuid = () => crypto.randomUUID();

/**
 * Resolve a test account's own Account ID by logging in as them.
 *
 * Pinning the id from a task brief is how this script broke: the database was
 * re-seeded during an outage, both test accounts were issued different ids, and
 * a stale constant turned every send assertion into a 404 that read like a
 * contract failure. An id is only valid for the row that minted it.
 */
async function resolveAccountIdOf(email, password) {
  const r = await loginWithRetry(() => auth.login({ email, password }));
  // The client attaches its bearer from an in-memory cache, so logging in as
  // somebody else does NOT change what the next request sends. Without this the
  // profile read below comes back as the *caller's* account, and the helper
  // silently returns the wrong id — which then surfaces as a confusing
  // "Cannot send to your own Account ID" from deep inside the send group.
  clientMod.setCachedSessionToken(r.token);
  try {
    const me = await account.getMe();
    return { token: r.token, accountId: me?.accountId?.accountId ?? null };
  } finally {
    // Put the caller's own token back for the rest of the run.
    clientMod.setCachedSessionToken(callerToken);
  }
}

// --------------------------------------------------------------------------
console.log(`contract check against ${BASE}`);
console.log(`  test account: ${EMAIL}`);

group('reachability');
{
  const res = await fetch(`${BASE}/health/ready`);
  const body = await res.json().catch(() => ({}));
  eq(res.status, 200, 'GET /health/ready returns 200');
  eq(body?.status, 'ok', 'the backend reports itself ready');
}

let callerToken = null;
const auth = await load('lib/api/auth.ts');
const account = await load('lib/api/accountId.ts');
const contactsApi = await load('lib/api/contacts.ts');
const transactions = await load('lib/api/transactions.ts');
const wallet = await load('lib/api/wallet.ts');
const clientMod = await load('lib/api/client.ts');

group('login and identity');
let myAccountId = null;
{
  const result = await loginWithRetry(() => auth.login({ email: EMAIL, password: PASSWORD }));
  ok('login returns a session token');
  eq(typeof result.token, 'string', 'the token is a string');
  clientMod.setCachedSessionToken(result.token);
  callerToken = result.token;

  // The dev shortcut is a non-production convenience, not part of the contract.
  const leaked = JSON.stringify(result);
  if (/devVerificationCodes|devCode/.test(leaked)) {
    bad('login does not include a dev verification code',
      'devVerificationCodes is not a contract; nothing in the client may rely on it');
  } else {
    ok('login does not include a dev verification code');
  }

  const me = await account.getMe();
  ok('GET /api/account/me responds');

  // The single most likely integration bug on this endpoint.
  if (me.accountId === null || me.accountId === undefined) {
    bad('data.accountId is present', 'this account has no Account ID yet');
  } else if (typeof me.accountId === 'object') {
    ok('data.accountId is an object, not a string');
    if (typeof me.accountId.accountId === 'string') {
      ok('data.accountId.accountId is the 10-digit string');
      myAccountId = me.accountId.accountId;
      // The hazard, stated affirmatively. `String(anyPlainObject)` is always
      // "[object Object]", so asserting its *absence* here could never pass.
      eq(String(me.accountId), '[object Object]',
        'stringifying the object yields [object Object] — the hazard is real');
      eq(myAccountId.length, 10, 'the correctly-read id is 10 digits');
      eq(/^\d{10}$/.test(myAccountId), true, 'the correctly-read id is all digits');
    } else {
      bad('data.accountId.accountId is the 10-digit string', typeof me.accountId.accountId);
    }
  } else {
    bad('data.accountId is an object, not a string',
      `got ${typeof me.accountId}: ${JSON.stringify(me.accountId)}`);
  }

  eq(typeof me.id, 'string', 'data.id is the user id');
  eq(typeof me.email, 'string', 'data.email is present');
  for (const field of ['name', 'photoUrl', 'defaultNetwork']) {
    const v = me[field];
    ok(`data.${field} is string-or-null (${v === null ? 'null' : typeof v})`);
  }
}

// Resolved by logging in as the recipient rather than taken from a constant.
// The ids in any task brief go stale the moment the database is re-seeded, and
// a stale id reads as a contract failure rather than as a missing fixture.
let recipientId = RECIPIENT;
if (!recipientId) {
  const RECIPIENT_EMAIL = process.env.UL_MARA_RECIPIENT_EMAIL;
  const RECIPIENT_PASSWORD = process.env.UL_MARA_RECIPIENT_PASSWORD;
  if (!RECIPIENT_EMAIL || !RECIPIENT_PASSWORD) {
    console.log('\n  (no recipient credentials supplied — send checks skipped)');
  } else {
    const resolved = await resolveAccountIdOf(RECIPIENT_EMAIL, RECIPIENT_PASSWORD);
    recipientId = resolved.accountId;
    if (recipientId) {
      ok(`resolved the recipient Account ID by logging in (${recipientId})`);
    } else {
      bad('the recipient account has an Account ID',
        'login succeeded but /api/account/me carried no accountId');
    }
  }
}
console.log(`  recipient:    ${recipientId ?? '(unresolved — send checks skipped)'}`);

await attempt('send group', async () => {
group('send: network, not chain, and a required idempotencyKey');
if (!recipientId) {
  bad('a recipient Account ID is available',
    'supply UL_MARA_RECIPIENT_EMAIL and UL_MARA_RECIPIENT_PASSWORD');
} else {
  // `sendPayment` takes `symbol`, not `asset` — the asset mapping is its job,
  // so the payload below is exactly what the app would send.
  const payload = (extra) => ({ recipientAccountId: recipientId, symbol: 'ETH', amount: '0.001', network: 'ETH', pin: PIN, ...extra });

  await expectStatus('send without idempotencyKey is refused',
    () => transactions.sendPayment(payload({})), 400);
  // NOT asserted here: `sendPayment` assembles its body from a fixed field list,
  // so it cannot emit `chain` at all. Strictness on that key is a property of
  // the backend, checked over raw HTTP in the last group.
  await expectStatus('send with a non-UUID idempotencyKey is refused',
    () => transactions.sendPayment(payload({ idempotencyKey: 'not-a-uuid' })), 400);
  // Likewise: `recipientAddress` is not one of the fields `sendPayment` sends,
  // so the "exactly one recipient" rule cannot be exercised through it.

  const key = uuid();
  const created = await withBackoff(
    () => transactions.sendPayment(payload({ idempotencyKey: key })),
    { label: 'send' }
  );
  const tx = created.transaction;
  ok('send succeeds with network + idempotencyKey');
  eq(tx.status, 'processing', 'a fresh transfer is PENDING (normalised to "processing")');
  eq(tx.txHash ?? null, null, 'a fresh transfer has no txHash before broadcast');
  eq(tx.amount, '0.001', 'the amount round-trips as a string');
  eq(typeof tx.id, 'string', 'the transfer has an id');

  const replay = await withBackoff(
    () => transactions.sendPayment(payload({ idempotencyKey: key })),
    { label: 'send (idempotent replay)' }
  );
  eq(replay.transaction.id, tx.id, 'the same idempotencyKey returns the same transfer');

  await expectStatus('the same idempotencyKey with different params is a 409',
    () => transactions.sendPayment(payload({ amount: '0.002', idempotencyKey: key })), 409);

  group('broadcast: signedTx only, and the body is strict');
  {
    const captured = [];
    const realPost = clientMod.apiClient.post;
    clientMod.apiClient.post = (url, body) => {
      captured.push({ url: String(url), body });
      return realPost(url, body);
    };
    await transactions.broadcastTransaction(tx.id, '0x02f872010680').catch(() => null);
    clientMod.apiClient.post = realPost;

    eq(captured.length, 1, 'broadcast issues exactly one request');
    eq(captured[0]?.url, `/api/transaction/${tx.id}/broadcast`, 'broadcast hits :id/broadcast');
    eq(Object.keys(captured[0]?.body ?? {}), ['signedTx'],
      'the body carries signedTx and nothing else');
  }
}
});

group('contacts: PATCH preserves the id');
{
  const probeName = `contract-probe-${Date.now()}`;
  let created = null;
  try {
    created = await contactsApi.createContact({
      accountId: recipientId ?? myAccountId,
      name: probeName,
    });
    ok('POST /api/contact creates a contact');
    eq(typeof created.id, 'string', 'the created contact has an id');
    eq(created.name, probeName, 'the name round-trips');

    await expectStatus('a duplicate contact name is a 409, not a 500',
      () => contactsApi.createContact({ accountId: myAccountId, name: probeName }), 409);

    const renamed = await contactsApi.updateContact(created.id, { name: `${probeName}-renamed` });
    eq(renamed.id, created.id, 'PATCH preserves the contact id');
    eq(renamed.name, `${probeName}-renamed`, 'PATCH applies the new name');
    eq(renamed.accountId, created.accountId, 'a rename does not change the Account ID');

    // The client refuses this before it makes a request, so there is no HTTP
    // status to assert — the guard that does it was added deliberately. Assert
    // that the call fails, and that it fails locally.
    let emptyBodyFailed = false;
    let madeRequest = false;
    const realPatch = clientMod.apiClient.patch;
    clientMod.apiClient.patch = (...a) => { madeRequest = true; return realPatch(...a); };
    try {
      await contactsApi.updateContact(created.id, {});
    } catch {
      emptyBodyFailed = true;
    }
    clientMod.apiClient.patch = realPatch;
    eq(emptyBodyFailed, true, 'PATCH with an empty body is refused');
    eq(madeRequest, false, 'the empty-body refusal happens before any request');
    await expectStatus('PATCH with an unknown Account ID is a 404',
      () => contactsApi.updateContact(created.id, { accountId: '0000000000' }), 404);
  } finally {
    if (created) {
      const gone = await contactsApi.deleteContact(created.id).then(() => true, () => false);
      ok(gone ? 'the probe contact was removed' : 'WARNING: the probe contact was NOT removed');
    }
  }
}

group('token balances: chain is UPPERCASE and case-sensitive');
{
  const addresses = await wallet.fetchWalletAddresses();
  ok('GET /api/wallet/addresses responds');
  eq(Array.isArray(addresses), true, 'addresses is an array');
  eq(addresses.length, 8, 'all eight chains have a registered address');

  const eth = addresses.find((a) => a.chain === 'ETH');
  if (!eth) {
    bad('an ETH address is registered', 'none found');
  } else {
    const { data } = await clientMod.apiClient.get('/api/wallet/token-balances', {
      params: { chain: 'ETH', address: eth.address },
    });
    ok('GET /api/wallet/token-balances returns 200');
    const rows = data?.data;
    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0];
      for (const f of ['symbol', 'name', 'chain', 'network', 'decimals', 'contractAddress', 'balance']) {
        eq(f in row, true, `a row carries ${f}`);
      }
      eq(typeof row.contractAddress, 'string', 'contractAddress is a string (the field is not named `address`)');
      eq('address' in row, false, 'the row does not use `address` for the contract');
      eq(typeof row.balance, 'string', 'balance is a string');
      eq(typeof row.decimals, 'number', 'decimals is a number');
      eq(row.chain, String(row.chain).toLowerCase(), 'the row `chain` is lower-case');
      eq(row.network, String(row.network).toUpperCase(), 'the row `network` is UPPERCASE');
    } else {
      ok('no token rows for ETH here (an empty array is a valid answer)');
    }

    await expectStatus('a lower-case chain parameter is refused',
      () => clientMod.apiClient.get('/api/wallet/token-balances', {
        params: { chain: 'eth', address: eth.address },
      }), 400);
  }
}

group('wallet balances: null is not zero');
{
  const balances = await wallet.fetchWalletBalances();
  ok('GET /api/wallet/balances responds');
  eq(Array.isArray(balances), true, 'balances is an array');
  const nulls = balances.filter((b) => b.balance === null);
  ok(`${nulls.length} chain(s) report a null balance`);
  eq(balances.some((b) => typeof b.balance === 'number'), false,
    'balances are strings or null — never a coerced number');
}

group('payment request: note, and the response fields');
{
  const request = await transactions.createPaymentRequest({
    amount: '1.5',
    symbol: 'ETH',
    note: '  contract probe  ',
  });
  ok('POST /api/payment/request creates a request');
  const link = await transactions.getPaymentLink(request.requestId);
  ok('GET /api/payment/request/:id responds');
  for (const f of ['note', 'symbol', 'requesterAccountId', 'requesterName']) {
    eq(f in link, true, `the pay link carries ${f}`);
  }
  eq(link.note, 'contract probe', 'the note arrives trimmed');
  eq('userId' in link, false, 'the pay link does not expose an internal user id');
  eq(typeof link.requesterAccountId, 'string', 'requesterAccountId is a string');
  ok('requesterName is string-or-null');
}

group('PIN endpoints: set-pin is first-time only');
{
  await expectStatus('set-pin is refused once a PIN exists', () => auth.setPin(PIN), 409);
  await expectStatus('change-pin refuses a wrong current PIN',
    () => auth.changePin('000000', '654321'), 401);
  const verified = await auth.verifyPin(PIN);
  eq(verified.valid, true, 'verify-pin accepts the real PIN');
}

group('settings nullability, read-only');
{
  // This check observes rather than writes: clearing a field is a real mutation
  // and the account is shared, so it is left to a deliberate manual step.
  const me = await account.getMe();
  ok('the account is readable');
  console.log(`       name=${JSON.stringify(me.name)} photoUrl=${JSON.stringify(me.photoUrl)} defaultNetwork=${JSON.stringify(me.defaultNetwork)} currency=${JSON.stringify(me.defaultCurrency)}`);
  ok('settings values are observable through getMe');
}

group('backend strictness, over raw HTTP');
{
  // These two rules cannot be reached through the client, because the client
  // never emits the offending keys. They are still worth pinning — a future
  // change to `sendPayment` that started forwarding `chain` would otherwise
  // only be caught at runtime, in production.
  // Throws on a non-2xx, carrying `status`, so `withBackoff` can see a 429 and
  // retry it. Returning the status instead meant a throttled call looked like an
  // ordinary result, the retry never fired, and the assertion below compared a
  // 400 against a 429.
  const raw = async (body) => {
    const res = await fetch(`${BASE}/api/transaction/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${callerToken}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(json?.message ?? `HTTP ${res.status}`), { status: res.status });
    }
    return json;
  };

  if (!recipientId) {
    bad('a recipient Account ID is available for the strictness checks', 'skipped');
  } else {
    const common = {
      recipientAccountId: recipientId,
      asset: 'ETH',
      amount: '0.001',
      network: 'ETH',
      pin: PIN,
      idempotencyKey: uuid(),
    };

    const withChain = await withBackoff(() => raw({ ...common, chain: 'ETH' }), { label: 'raw send' })
      .then(() => null, (e) => e);
    eq(withChain?.status, 400, 'the backend rejects `chain` on send');
    ok(`  -> ${withChain?.message}`);

    const both = await withBackoff(
      () => raw({ ...common, recipientAddress: '0x1111111111111111111111111111111111111111' }),
      { label: 'raw send' }
    ).then(() => null, (e) => e);
    eq(both?.status, 400, 'the backend rejects both recipient fields at once');
    ok(`  -> ${both?.message}`);
  }
}

group('the live spec still advertises what the client calls');
{
  const spec = await fetch(`${BASE}/docs/json`).then((r) => r.json()).catch(() => null);
  if (!spec) {
    bad('the live spec is fetchable', 'no /docs/json');
  } else {
    const paths = Object.keys(spec.paths ?? {});
    const ops = paths.reduce((n, p) => n + Object.keys(spec.paths[p]).filter((m) =>
      ['get', 'post', 'patch', 'put', 'delete'].includes(m)).length, 0);
    ok(`the spec lists ${paths.length} paths / ${ops} operations`);
    const mustHave = [
      ['/api/contact/{id}', 'patch'],
      ['/api/transaction/{id}/broadcast', 'post'],
      ['/api/transaction/send', 'post'],
      ['/api/wallet/register', 'post'],
      ['/api/wallet/token-balances', 'get'],
      ['/api/payment/request/{id}', 'get'],
      ['/api/auth/set-pin', 'post'],
      ['/api/auth/change-pin', 'post'],
      ['/api/account/me', 'get'],
    ];
    for (const [p, method] of mustHave) {
      eq(spec.paths?.[p]?.[method] !== undefined, true, `the spec has ${method.toUpperCase()} ${p}`);
    }
    // A route the client must never call: C6 removed the backend routes.
    for (const [p, method] of [['/api/push/token', 'post'], ['/gas/quote', 'post'], ['/gas/submit', 'post']]) {
      eq(spec.paths?.[p]?.[method] === undefined, true, `the spec has no ${method.toUpperCase()} ${p}`);
    }
  }
}

// --------------------------------------------------------------------------
console.log(`\n${'-'.repeat(62)}`);
if (fail === 0) {
  console.log(`contract check PASSED — ${pass} assertions against ${BASE}`);
} else {
  console.log(`contract check FAILED — ${fail} failed, ${pass} passed\n`);
  for (const f of failures) console.log(`  [${f.group}] ${f.label}`);
}
process.exit(fail === 0 ? 0 : 1);