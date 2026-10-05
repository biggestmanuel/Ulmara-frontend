# Frontend contract notes

Things about this codebase and its backend that are easy to get wrong, and that
have each caused a real defect. Written for whoever works on this next —
including a future session with no memory of any of it.

Everything here was found by exercising a running backend, not by reading it.

## Running things

```bash
npm run verify     # typecheck + lint + test + both audits — run this first
npm run test       # 396 assertions, no network needed
npm run contract   # 94 assertions against a live backend (see below)
```

`npm run contract` needs a running backend and credentials that are
**deliberately not committed**:

```bash
UL_MARA_API=http://localhost:4100 \
UL_MARA_TEST_EMAIL=you@example.test \
UL_MARA_TEST_PASSWORD=... \
UL_MARA_RECIPIENT_EMAIL=their@example.test \
UL_MARA_RECIPIENT_PASSWORD=... \
npm run contract
```

---

## The traps

### 1. `data.accountId` is an object, not a string

`GET /api/account/me` returns:

```json
"accountId": { "id": "…", "accountId": "6145572406", "userId": "…", "createdAt": "…" }
```

The 10-digit ID is at `.accountId.accountId`. Reading the property directly gives
you the object, and `String()` on any plain object is `"[object Object]"` — which
then gets written into SecureStore as the user's Account ID.

This was invisible for a long time because `getMe()` returned `Promise<any>`.
`MeProfile` and `MeAccountId` in `lib/api/accountId.ts` now describe it, so a
change breaks at compile time instead of at runtime.

**Never write `!String(x).startsWith('[object')` as a test of this.** That
assertion is unsatisfiable — every plain object stringifies that way. Assert the
hazard affirmatively, which is what the suite does.

### 2. `send` uses `network`; everything else uses `chain`

`POST /api/transaction/send` takes `network`, UPPERCASE. Every other endpoint
takes `chain`. Sending `chain` to `send` is a 400 `Unrecognized key`.

`idempotencyKey` (a UUID) is **required** on `send`.

The body is strict. `sendPayment` assembles it from a fixed field list, so it
cannot emit a stray key — which means several backend rules cannot be exercised
through the client and are checked over raw HTTP instead.

### 3. A transfer is two phases

`send` returns **201 with status `PENDING` and queues nothing**. That is correct.
You must then call `POST /api/transaction/:id/broadcast` with `{ signedTx }`.

A transfer sitting at `PENDING` means broadcast has not happened yet.

**The broadcast body is `{ signedTx }` and nothing else.** An extra
`idempotencyKey` is a 400 — this was a live bug that broke every internal
transfer on its second step.

Retry-safety does *not* come from a key. It comes from the server's atomic
`PENDING → PROCESSING` claim: three broadcasts of a fresh row all return 200
with one worker job. Once the worker settles the row you get
`409 "Transaction is no longer awaiting broadcast"` — a real code path, not an
error state.

### 4. `wallet/register` needs all eight chains

`POST /api/wallet/register` takes `addresses`, not `wallets`, and requires an
address for **every** chain: `TON, BSC, ETH, SOL, BASE, POLYGON, TRON, BTC`.
A partial list is a 400 naming what's missing.

### 5. `set-pin` is first-time only

`POST /api/auth/set-pin` is **200 the first time, 409 once a PIN exists**.
`POST /api/auth/change-pin` is the only way to replace one.

`create-pin.tsx` is still reachable when a PIN already exists — most obviously on
a **second device**, where the account was set up on one and the same onboarding
runs on the other. It branches on the 409 and routes to `verify-pin`, where the
existing PIN can be proven. Without that branch it dead-ends: every retry is
another guaranteed 409 on a screen with no route to Settings → Security.

`settings/security.tsx` already used `changePin` correctly. Check every caller of
`setPin` if this changes again.

### 6. Rate limits — a 429 is not a contract failure

| Endpoint | Limit |
|---|---|
| `POST /api/transaction/send` | 10/min per user |
| `/api/auth/set-pin`, `/change-pin`, `/verify-pin` | 5/min, **shared** |

Six sends inside a minute is enough to throttle yourself. A 429 says nothing
about whether a request body was correct — retry it, don't report it. Nine calls
produce `200 409 409 409 409 429 429 429 429`.

`npm run contract` handles this with backoff and logs each retry. Verified: two
back-to-back runs pass 94/94 with three retries logged between them.

### 7. Settings: omit leaves alone, `null` clears

`PATCH /api/account/settings` treats an absent key and an explicit `null`
differently:

| You send | Result |
|---|---|
| key omitted | left alone |
| `"defaultNetwork": null` | **cleared** |
| `{"name": ""}` | 400 — never clear with `""` |
| `"defaultCurrency": null` | 400 — `NOT NULL` with a default |

`name`, `photoUrl` and `defaultNetwork` are nullable. `defaultCurrency` and
`defaultLanguage` are not.

`SettingsPatch` in `lib/api/accountId.ts` encodes this: nullable columns are
`?: string | null`, the `NOT NULL` ones are `?: string`. **Do not wrap it in
`Partial<>`** — `Partial` permits `{ name: undefined }`, `undefined` is dropped
during serialisation, and a caller meaning "clear this" silently leaves the value
alone.

### 8. Don't hard-code an Account ID

The database has been re-seeded more than once. Both test accounts were issued
new IDs, and a pinned constant turned every send assertion into a 404 that read
like a contract failure.

**An ID only ever matches the row that minted it.** `npm run contract` resolves
the recipient by logging in as them for exactly this reason.

### 9. Two "unavailable" states that are not bugs

- **`TON` and `BTC` balances are `null`.** Rendering that as `0.00` looks
  correct and is a lie. `walletStore` filters the row out instead.
- **`/api/ramp/*` returns 503** until provider credentials exist on the backend.

### 10. The client calls no ramp provider directly

Fiat on/off-ramp goes through the backend at `/api/ramp/*`. There is no client
module for it — the previous one read a provider key in the app and sent it
off-device, and was deleted.

`EXPO_PUBLIC_COINGECKO_API_KEY` is the one remaining example of that pattern: it
is bundled and sent to CoinGecko as a query param. Low-value demo key, but it
should be proxied through the backend like the ramp.

The deposit and withdraw screens still say *"unavailable until Paystack is
configured"*, which describes an integration that does not exist in this
codebase. Copy is a product decision.

### 11. A wrong PIN is not an invalid session

The backend answers **401 for two unrelated things**: a dead session
(`requireAuth`) and a wrong PIN (`pinLockout`, behind a `requireAuth` that
already accepted the session).

Clearing the cached token on every 401 threw away a valid session on every
mistyped digit. `isSessionRejection()` in `lib/api/client.ts` distinguishes them
by the lockout service's prose, and fails **open** — an unrecognised 401 body is
treated as a session rejection, which is the behaviour that existed before.

**423 is only ever a lockout** and never implied an invalid session.

### 12. Two account endpoints, two different wallet shapes

`GET /api/account/{accountId}` and `GET /api/account/resolve/{accountId}` look
interchangeable and are not:

```
GET /api/account/{id}          profile.wallets: [{ chain }]           ← no address key
GET /api/account/resolve/{id}  profile.wallets: [{ chain, address }]
```

Both are stable — same key set on every call, across different accounts, eight
wallets each, and the two agree on the *count*. So these are two shapes, not one
shape that varies.

That is why `resolveAccountId` and `resolveAccountIdForTransfer` return different
types. They previously shared one, so `.address` on the first was `undefined`
under a type promising `string`.

**Nothing noticed.** The only caller of the address-less function is
`useAccountId`, which is unused, and the one place `wallets` is consumed —
`app/send/network-select.tsx` — filters its input down to entries where
`address` is a string. A regression here therefore yields an empty list, not a
crash, which is exactly the shape of change that passes every test.

Only `resolveAccountIdForTransfer` works for a transfer. Resolving your own
Account ID is a `400` ("Cannot resolve your own Account ID for transfer").

### 13. The settings PATCH answers with a narrower row than `/me`

```
GET  /api/account/me         17 keys
PATCH /api/account/settings  14 keys
missing: accountId, pinFailedAttempts, pinLockedUntil
```

Measured across four different patches (name set, name cleared,
`defaultCurrency` set, `photoUrl` cleared) — always 14, always those three
absent, and never a key the patch did not touch. It is a narrower *row*, not an
echo of the request.

`updateSettings` therefore returns
`MeProfileAfterSettingsPatch = Omit<MeProfile, 'accountId' | 'pinFailedAttempts' | 'pinLockedUntil'>`.
It used to claim `Promise<MeProfile>`, promising three fields that arrive as
`undefined`. Harmless today only because the single call site discards the result.

Declared as an `Omit` deliberately: a field `MeProfile` gains that the PATCH does
return flows through, and one it gains that the PATCH does *not* return points the
compiler at the `Omit`, rather than letting a `undefined` reach a screen.

If you need a whole profile after saving settings, call `getMe()`.

---

## Environment notes

**The app has never been run.** No screen has been rendered and no flow has been
exercised in Expo. The gates are green and the contract is verified against a
live backend, but nothing here has been proven on a device.

**A corrupted `node_modules` once made `tsc` fail with 358 errors** across the
repo, including at an unmodified baseline. `react-native`, `expo-constants` and
`expo-secure-store` had been replaced by `0.0.0-audit-shim` packages with no
`types` field. A clean `npm ci` gives zero errors. **If `tsc` reports errors,
check the installed versions before assuming you caused them** — and compare
against the baseline rather than trusting an absolute pass/fail.

The pre-commit hook runs `typecheck`, `lint` and `audit:design`. If it fails on
something unrelated to your change, that is worth reporting rather than bypassing
with `--no-verify`.

---

## Verifying your own work

Revert your change and confirm the tests fail. Every fix in this repo has that
recorded — the count of assertions that fail is in each commit message.

A test that cannot fail is worse than no test, because it reads as coverage.
Three that slipped through:

- `Object.assign(new Error(), { status: 404 })` where the code path reads
  `axios.isAxiosError` — the status was never seen, so an assertion about the
  behaviour it guards passed against the very code it was written to catch. The
  suite already carried a comment about a stub hiding a bug, and the same trap
  was taken again.
- A probe initialised `madeRequest = true` and set it `false` *inside* the stub,
  so "no request was made" and "a request was made" looked identical.
- An assertion that a string does **not** start with `[object`, which no plain
  object can satisfy.

Also: a whole-file grep cannot tell a doc comment from a signature. Assert
against `export async function … : Promise<any>`, not `Promise<any>`.

**A suite that loses assertions still passes.** One edit here silently deleted 45
assertions and the suite went from 333 to 250 with every test green. It was
caught only because a revert-based sweep reported zero failures where failures
were impossible. If a change touches `scripts/logic-tests.mjs`, check the
assertion count moved in the direction you expect.

---

## When something looks broken but is not

- `PENDING` on a fresh transfer — broadcast has not run yet.
- `409` from broadcast after the worker settles the row — already moving.
- `503` from `/api/ramp/*` — no provider credentials configured.
- `null` balances for `TON`/`BTC` — no funded address.
- `422`/whichever on a chain with no contract code at that address.
- `devVerificationCodes` in a response — a non-production convenience, not a
  contract. **Never code against it.**
- Email landing in spam — sent from `onboarding@resend.dev` with no domain auth.

## Frozen areas

Do not change, absent an explicit instruction: the WebSocket surface, the
`defaultNetwork` nullability declaration (it is exactly right), `cursor` vs
`page` pagination naming, and the `PENDING`/`PROCESSING` status mapping.