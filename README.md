# Ulmara — Frontend

Non-custodial multi-chain crypto wallet. Send and receive using a 10-digit Account ID instead of a raw blockchain address — PalmPay/OPay-style simplicity with self-custody underneath.

## Stack

- React Native + Expo (`expo-router`)
- Zustand for state (`stores/`)
- Chains: TON, BSC, ETH, SOL, Base, Polygon, TRON, BTC (`@ton/*`, `ethers`, `@solana/web3.js`, `tronweb`)
- Address validation via TriVerify SDK
- Secure storage: `expo-secure-store`, `react-native-mmkv`
- Key generation: `bip39`, `ed25519-hd-key`, `react-native-fast-pbkdf2`

## Project layout

```
app/                  expo-router screens
  (auth)/             onboarding, login, PIN/biometric setup
  (tabs)/             main tab navigation
  send/, receive/     transfer flows
  deposit-withdraw/   fiat ramp flows
  wallet/, settings/, transaction/
components/           UI + feature components by domain
lib/
  chains/             per-chain signing/broadcast logic
  routing/            smart routing between chains
  gas/                gas abstraction
  validation/         address/account-id validation
  signing/            key derivation, tx signing
  storage/            secure local storage wrappers
  api/                backend API client
  lib/ramp/           (removed — the fiat on/off-ramp integration is backend-only,
                     reached through /api/ramp/*; the unused client-side provider
                     module was deleted, see the report)
hooks/                useAccountId, useBalance, useTransactionStatus
stores/               Zustand stores (auth gate, wallet, tx, user, prefs)
types/                shared TS types
```

## Setup

```bash
npm install
cp env.example .env
npx expo start
```

Fill in `.env`:

```
EXPO_PUBLIC_API_BASE_URL=
EXPO_PUBLIC_RPC_ETH / BSC / BASE / POLYGON / SOL / TRON / TON=
# TriVerify is called by the backend; do not put its key in the app.
```

`GAS_SPONSOR_PRIVATE_KEY` is backend-only — never expose it as `EXPO_PUBLIC_*`.
Fiat on/off-ramp goes through `/api/ramp/*`; the backend holds the provider
credentials, so no provider key is set in the app.

## Scripts

```bash
npm run start       # expo start
npm run start:clean # expo start --clear (rebuilds the Metro cache)
npm run android
npm run ios
npm run web
npm run lint
npm run typecheck
```

### When to use `start:clean`

Metro caches transformed modules, so edits to files under `patches/`
(patch-package output — e.g. `@ton/crypto-primitives`, applied on
`npm install` via the `postinstall` hook) can keep serving the stale,
unpatched version from cache. Start with `npm run start:clean` whenever:

- a patch under `patches/` was added or changed,
- `node_modules` was reinstalled / `npm ci` ran,
- a bundled-library crash (e.g. the "Cannot read property 'derive' of null"
  PBKDF2 issue) persists even though the patch is present in `node_modules`.

## Status

- tsc / eslint clean (0 errors, 0 warnings); 83/83 logic tests
- Design system rebuilt as "Warm Ink" — tokens, real typefaces, shared primitives
- **Every screen migrated**, enforced by `npm run audit:design` (see below)
- Contacts (V1) implemented
- Biometric unlock implemented (Face ID / Touch ID / Android biometrics)
- Push notifications implemented client-side; backend routes still required (see below)
- ERC-20 (USDT/USDC) support implemented for ETH/BSC/Base/Polygon, with token
  contracts read from `GET /api/wallet/tokens/:chain` (see below)
- Receipt sharing done
- External-wallet validation is proxied through the backend (TriVerify credentials are not shipped in the app)

---

# Design system — "Warm Ink"

The previous theme was a saturated violet (`#635BFF`, Stripe's brand violet) on a
cool near-black (`#0D0F17`), with white overlays and heavy elevation on top. That
is the "near-black plus one neon accent" look, and it is the single biggest
reason the product read as a generic dashboard. The audit behind this redesign
found **22 distinct `borderRadius` values**, **21 distinct `fontSize` values**,
~30 hardcoded hex colours that ignored the theme entirely, **150 `Pressable`s
against only 50 `accessibilityLabel`s**, and **no custom font loaded at all** —
`expo-font` was installed and configured, but every glyph came from the OS
default.

All of that is addressed by three files, and the rest of the app is written
against them.

## Colour — 6 named values

The accent could not be red (that means "destructive"), could not be green
(that means "received"/"success", and the app already uses green/red direction
arrows in transaction rows), and could not be an electric blue or violet (that is
what every fintech template ships). What is left is the deep, warm, desaturated
end of the violet family: **aubergine**.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `primary` | `#4A2D5C` | `#B591C9` | The one accent: primary actions, current selection, the Account ID |
| `primaryLight` | `#EFE9F2` | `#2A2033` | Selected chips, quiet accent fills |
| `background` | `#FBF9F6` | `#141311` | The page. **Warm** off-white / warm charcoal |
| `surface` | `#FFFFFF` | `#1D1B19` | Cards, sheets, list groups |
| `textPrimary` | `#2A2724` | `#F4F0EA` | Warm espresso ink — never `#000`, never blue-black |
| `error` | `#A63D22` | `#E08A6B` | Destructive only. A burnt clay red, not fire-engine |

Supporting values: `textSecondary` `#6B6459`, `textMuted` `#9A9287`, `code`
`#57514A`, `border` `#E7E1D8`, `divider` `#EFE9E0`, `success` `#2F6B45`,
`warning` `#8A6510`, plus one explicit `*Tint` per semantic so `Badge` never
string-concatenates alpha onto a hex value.

**Depth comes from surface contrast and hairline rules, never from shadows.**
The old `Button` painted a coloured shadow under itself
(`shadowOpacity: 0.25`, `elevation: 4`) and the old `Card` shadowed every
instance. Stacking a dozen of those reads as noise, because a shadow's job is to
say "this one floats above that one" — once everything floats, nothing does.

## Typography

`expo-font` was present but unused. Two families are now loaded and the splash
screen is held until they resolve, so the app never flashes in the system face
and then swaps — a visible reflow on every cold start, and worse on a screen
where the type *is* the content.

- **Newsreader** (serif) — display only: screen titles, section headings, and the
  balance figure. A serif is the register of a statement or a receipt. Using it
  *only* for display is what makes it read as a considered financial document
  rather than a heritage-banking costume, and it is the strongest single signal
  that this is a money product rather than a crypto dashboard.
- **Manrope** (geometric sans) — everything else, including **every numeral**. Its
  tabular figures matter more here than in most apps: balances tick live, the
  Account ID is read character by character, and amounts sit in tight columns.
- **System monospace** — addresses, hashes, seed phrases. Correct for code-like
  values where digit confusion is a real risk.

An eight-step scale in `lib/theme/tokens.ts` is the only set of sizes that
exists: `amount` 44 · `title` 28 · `heading` 21 · `titleSm` 17 · `body` 15 ·
`label` 13 · `code` 13 · `caption`/`micro` 12/11. `tabularNums` is applied to
every value that changes in place.

## Layout

- Gutter 24, a five-step radius scale (8 / 12 / 16 / 22 / pill), control height
  56, 44pt minimum for anything icon-only.
- `Screen` centralises the safe area, the gutter, a `contentMaxWidth` so prose
  never becomes a long line on a tablet, and a bottom-anchored action area.
- **Content is a single centred column, not a grid of cards.** Lists are rows
  with hairlines between them, not boxed stacks.
- Primary action is always last, at the thumb.

## What makes it Ulmara

1. **The Account ID is the logo.** It gets the app's signature treatment —
   tabular figures, 1.2px tracking, a real size — and the Welcome mark is ten
   dots with three filled, drawn from plain views.
2. **Ink, not chrome.** Hairlines and whitespace, no shadows, no gradients.
3. **Warm neutral, one matte accent.** The palette of an official document, which
   is the trust signal a non-custodial wallet needs.
4. **Serif display over crypto plumbing.** The clearest statement that this is a
   financial product.

## Accessibility

- `IconButton` requires `accessibilityLabel` as a **prop**, so a new icon-only
  control cannot be added unnamed. It guarantees a 44pt box, a role, and
  `accessibilityState` for selection.
- `Keypad` is shared by `create-pin` and `verify-pin`. The two had drifted, and
  **`create-pin` had no labels or roles on any key** — the screen used to *create*
  the PIN that authorises every transfer was unusable with a screen reader.
- `Badge` takes an icon for every state tone, so status is never colour alone.
- `useReducedMotion` (new) is the single place that decides whether a transition
  runs; nothing previously honoured it.
- `aria-selected` is passed explicitly alongside `accessibilityState`, because
  react-native-web does not translate the latter.
- PIN dots report the **count** via `accessibilityValue` and hide the digits.

## Shared primitives

`components/ui/` — `Screen`, `Button`, `IconButton`, `Input`, `PasswordField`,
`Card`, `Typography`, `Amount`, `AccountId`, `ListRow`, `EmptyState`, `Keypad`,
`CodeBoxes`, `SegmentedControl`, `Sheet`, `Badge`, `Avatar`, `LoadingSpinner`,
`Divider`, `CopyToast`.

Press feedback runs on the UI thread through a `useSharedValue` and
`withTiming` per `AGENTS.md`; nothing in the app drives animation from React
state.

## Every screen is on the shared kit

All 35 screens and 24 components are built from `components/ui`. This is
**enforced**, not aspirational: `npm run audit:design` fails on a hardcoded hex
outside the theme, a control without an accessible name, a `borderRadius` or
`fontSize` off the shared scales, a text glyph used as an icon, a hand-rolled
`<Modal>`, or a screen that does not import the kit. It runs in the pre-commit
path, so a regression cannot land quietly.

Two files are deliberately exempt, both documented in the script:

- `app/receive/index.tsx`, `app/receive/payment-request.tsx` and
  `components/transaction/ReceiptCard.tsx` keep literal black/white for their
  **QR plates** — a scanner needs the inversion, so this is a hardware
  constraint rather than a styling shortcut.
- `components/transaction/ReceiptCard.tsx` also keeps its own compact
  typographic scale, because it is a *document that gets exported as a PNG* and
  read by people who have never seen this app.

`lib/theme/tokens.ts` gained a documented **hero type tier** (24/26/32/34/36)
for the five places that legitimately need type larger than `amount` — the
Welcome promise, the Account ID on its own screen, the asset detail amount, the
keypad digits and the OTP boxes. They are named in the scale and allowed by the
audit, rather than being magic numbers typed into five files.

---

## Push notifications

Client side is complete: permission request, Expo push token acquisition,
persistence, refresh, and foreground/background/open handling.

| File | Role |
| --- | --- |
| `lib/push/pushNotifications.ts` | permission flow, token get/refresh, secure persistence, `parseTransactionNotification` validator |
| `lib/push/notificationService.ts` | foreground + background + response listeners, deep links, dedupe |
| `stores/notificationStore.ts` | notification list, unread count, per-event preferences |
| `app/notifications.tsx` | notification centre |
| `app/settings/notifications.tsx` | per-event toggles + permission status |

`lib/push/pushNotifications.ts` holds the only place a push contract is defined:

```ts
export const PushTokenPath = {
  register: process.env.EXPO_PUBLIC_PUSH_TOKEN_PATH ?? '/api/push/token',
  remove:   process.env.EXPO_PUBLIC_PUSH_TOKEN_PATH ?? '/api/push/token',
};
```

### Required backend routes

**Neither route exists on the backend today.** The client degrades gracefully —
a `404` from the register call is treated as "push not supported yet", the
token is still stored locally, and nothing is shown to the user. Register the
routes to switch the feature on:

```
POST   {EXPO_PUBLIC_PUSH_TOKEN_PATH}   body: { token, platform, deviceName? }  -> 204
DELETE {EXPO_PUBLIC_PUSH_TOKEN_PATH}   (Authorization header identifies device)  -> 204
```

Sending is expected as an Expo push message:

```json
{
  "to": "<expo push token>",
  "title": "Payment received",
  "body": "You received 5,000 NGN",
  "data": {
    "type": "transaction",
    "transactionId": "<uuid>",
    "status": "completed"
  },
  "sound": "default"
}
```

### Security notes

- The push token lives in `SecureStore` (not `MMKV`) and is deleted on logout and
  on account deletion.
- No Expo access token or any other secret is in the app. Delivery credentials
  belong to the backend.
- `parseTransactionNotification` validates `data` strictly and drops anything
  unexpected rather than navigating on untrusted input.

### Manual setup (required — no device-free path exists)

1. A **physical device**. `expo-notifications` push tokens are not issued to
   simulators/emulators, and this has no web implementation.
2. Expo credentials configured for the project (`npx eas credentials`), or
   `EAS_ACCESS_TOKEN` set for CI.
3. A development build, not Expo Go:
   `npx expo prebuild && npx expo run:android` (or `--ios`).
4. Grant permission when prompted, then Settings → Notifications to confirm the
   toggle reports "registered".

---

## ERC-20 token support (USDT / USDC)

Implemented for the EVM chains: **ETH, BSC, Base, Polygon**. Native-coin
transfers are unchanged.

| File | Role |
| --- | --- |
| `constants/tokens.ts` | token registry + hydration cache, canonical mainnet seeds, env overrides |
| `lib/tokens/erc20.ts` | `balanceOf`, `encodeTokenTransfer`, `parseTokenAmount`, `validateTokenAmount`, gas estimate |
| `lib/api/tokens.ts` | **token registry from the backend**, balances — backend first, direct RPC as fallback |
| `lib/signing/evm.ts` | `eth_signTransaction` for both native and ERC-20 transfers |
| `lib/signing/chainAdapters.ts` | ETH/BSC/Base/Polygon adapters, all signable |

### Token contracts come from the backend registry

`GET /api/wallet/tokens/:chain` is authoritative about which ERC-20 contracts
exist on a network, at which address, with how many decimals. Observed responses:

```
GET /api/wallet/tokens/ETH     -> 200  USDC  6dp  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238   (Sepolia USDC)
GET /api/wallet/tokens/BSC     -> 200  USDC 18dp, USDT
GET /api/wallet/tokens/BASE    -> 200  USDC  6dp
GET /api/wallet/tokens/POLYGON -> 200  USDC  6dp
GET /api/wallet/tokens/eth     -> 400  "Unsupported chain: eth"
```

Two things about that endpoint are easy to get wrong, and both are handled in
`lib/api/tokens.ts`:

1. **The chain must be UPPERCASE.** `ETH` works, `eth` returns 400. The app uses
   lowercase `ChainId`s internally (that is the wire convention the backend
   documents), so every call goes through `toWireChain`.
2. **A 400 means "no tokens on this chain", not "bad request"** — the pilot
   backend is only configured for Ethereum Sepolia, and for chains it knows it
   returns an empty list, which the client treats as a normal answer.

A token address is network-specific, and the local table in `constants/tokens.ts`
only holds canonical **mainnet** addresses. Fetching the registry is therefore the
difference between the send screen offering a working USDC transfer and offering
nothing at all on Sepolia. The registry is hydrated into a module-level cache so
the **signing** paths — which must resolve an address synchronously, because they
build calldata — read the backend's verified address through the same
`getTokenForChain` they already used. Local configuration is still consulted on
every lookup, and `EXPO_PUBLIC_TOKEN_ADDRESSES` always wins over the backend,
because supplying an address is explicit operator intent.

### Offline / no-registry fallback

```bash
# {"USDC:ETH":"0x...", "USDT:BSC":"0x..."} — keyed SYMBOL:CHAIN (UPPERCASE)
EXPO_PUBLIC_TOKEN_ADDRESSES=
```

Seeded mainnet addresses are only offered when the app is actually pointed at
mainnet (`getEvmChainId(chain) === <that chain's mainnet id>`), so a mainnet
address can never be used against a testnet. No test token has been deployed and
no address, deployment or transaction hash is committed in this repository.

### Network fee vs. token amount

The network fee is always denominated in the **native** coin, never in the token
being sent — ERC-20 transfers still consume the chain's own gas. `confirm.tsx`
states this explicitly, and `components/transaction/ReceiptCard.tsx` shows the
fee in the native symbol. A token transfer still requires a small native
balance to pay for gas; the send screen warns rather than silently producing a
transfer that cannot be broadcast.

---

## Routing quotes

`/api/routing/quotes` **does not exist on the backend**, which blocked the
entire send flow. Quotes are now built client-side in `lib/api/routing.ts`
(`buildRouteQuotes`, `pickRecommended`) from real gas prices read over RPC. The
`RouteQuote` interface is unchanged, so swapping back to a server implementation
is a change inside one file.

---

## Contacts (V1)

- Path prefix is **`/api/contact`** (singular) — that is what the backend mounts.
  `lib/api/contacts.ts` also sends `findConflictingName` / `findDuplicateAccountId`
  pre-flight hints so a duplicate is blocked in the UI before a request is made.
- **`PATCH /api/contact/:id`** takes `{ name?, accountId? }` (at least one) and
  returns the updated row under the **same id**. `updateContact` sends only the
  fields it is given, so a rename leaves the contact's Account ID untouched.
  There is no delete-and-recreate fallback: it orphaned the old id, and it
  mistook a real 404 (contact gone, or not the caller's) for a missing route.
- Screens: `app/contacts.tsx` (add / edit / remove / search / confirm / empty /
  error / loading), `components/contacts/ContactPicker.tsx` wired into
  `app/send/index.tsx`.

---

## Biometric unlock

`lib/security/biometrics.ts` is the only file that talks to the native biometric
API. It handles capability detection, outcome classification, and enrollment
drift detection.

The model is deliberately narrow:

- The **PIN is the only credential the server accepts.** It is hashed
  server-side (`User.pinHash`) and verified on every transfer. It is never
  cached on the device.
- A biometric success is a **device-local unlock shortcut**. It flips an
  in-memory `pinVerified` flag for this launch — exactly what entering the PIN
  does — and nothing more. It does not sign anything and is never transmitted.
- Nothing biometric is ever stored. Only a **capability bitmask** (e.g. `"2"` for
  Face ID) is persisted, so the app can notice the user added or removed a face
  or fingerprint and turn the shortcut off instead of leaving a button that can
  never succeed.
- Requires `NSFaceIDUsageDescription` (iOS) and the Android biometric
  permissions; both are set in `app.json`.
- Background re-lock after 2 minutes is implemented in `app/_layout.tsx`.

`verify-pin` also handles `409 "No PIN set for this account"` by routing to
`create-pin`, so an account whose onboarding stopped between Account ID creation
and PIN creation is not stuck on a keypad it can never satisfy.

---

## Known backend gaps

Found while walking the app against a running backend. None of these are
frontend defects — the client behaves correctly in each case — but they bound
what can be verified and what a user can do today.

1. **`POST /api/auth/signup` returns `201` even when the verification email
   cannot be sent.** With no email provider credentials the backend logs
   `signup_verification_email_failed` and then answers `201 success:true`, so
   the app sends the user to a "we sent you a 6-digit code" screen that can
   never be completed. Signup should fail, or the response should carry a
   delivery-failure flag the client can act on.
2. **CORS only allows `GET,HEAD,POST`.** `@fastify/cors` is registered with
   `origin` alone (`src/server/app.ts`), so `DELETE` and `PATCH` are rejected
   by the browser. Native builds are unaffected (CORS does not exist there),
   but **deleting a contact and renaming one cannot work from any browser
   client**. Add `GET, HEAD, POST, PATCH, DELETE, OPTIONS` to the CORS
   `methods` option.
3. **Duplicate contact name returns a bare `500`.** `contact.service.create`
   does not catch Prisma `P2002`. The client pre-blocks duplicates with a
   clear message, so users never see it, but the backend should map it to `409`.
4. ~~**No `PATCH /api/contact/:id`.**~~ Resolved: the route now exists and
   `updateContact` calls it directly. It is still blocked by gap 2 (CORS) from
   a browser until `PATCH` is added to the allowed methods.
5. **`POST /api/auth/set-pin` overwrites an existing PIN.** It succeeds with
   `200` and no `409`, without requiring the current PIN. Anyone holding a
   stolen session token can replace the PIN and then authorise transfers.
6. **No endpoint reports whether a PIN is set.** `GET /api/account/me` omits
   `pinHash` (correctly) and there is no `/api/account/pin-status`. The app
   discovers the state by calling `verify-pin` and handling `409
   "No PIN set for this account"`.
7. **No `/api/routing/quotes` and no `/api/push/*`.** See the sections above —
   routing is done client-side, push registration degrades to "unsupported".

Two more worth flagging, from the API-level walkthrough:

- The session JWT payload is only `{sub, iat, exp}`. Two logins in the same
  wall-clock second produce an identical token and collide on the unique
  `Session.token` column, returning `500`. It needs a `jti`.
- `GET /api/contact` returning `200` while `GET /api/contacts` returns `404` is
  correct — the prefix really is singular. It is a live trap for anyone reading
  the frontend's older paths.

### Re-verification

Every item above was re-tested against the running backend. **None of the five
previously-reported gaps is fixed**, and one new finding emerged:

| # | Re-tested | Result |
| --- | --- | --- |
| 1 | Contact deletion | **Still blocked.** `access-control-allow-methods: GET,HEAD,POST`. Browser reports `Method DELETE is not allowed by Access-Control-Allow-Methods` |
| 2 | PIN overwrite | **Still open.** `set-pin` a second time returns `200`; the old PIN immediately stops working. `change-pin` does require `currentPin` |
| 3 | Signup / verification | Signup still `201` with `data: { user, token }` and no delivery flag. `verify-email` wrong code → `400 "Invalid or expired verification code"` (correct). `resend-code` → **`503`**, because the provider still has no credentials |
| 4 | Push token | **Still `404`** on `/api/push/token`, `/api/push/register`, `/api/notifications/token`, `/api/ramp/push-token` |
| 5 | Duplicate contact name | **Still `500`** |
| 6 | **New** | `DELETE` with `Content-Type: application/json` and **no body** returns `400 "Body cannot be empty when content-type is set to 'application/json'"`. Fixed client-side by sending an explicit `{}`; the route itself still needs to tolerate an empty body |

Separately, `GET /api/wallet/tokens/:chain` **does** exist and is documented
above — it was missed by the original gap list.

---

## Web target (`npm run web`)

Web is a **development and review aid, not a shipping target** for this app.

`expo-secure-store` has no web implementation, so `lib/storage/secureStorage.ts`
falls back to `localStorage` on web. That fallback is **not a security boundary**
and it refuses outright to write key material:

- `evm_mnemonic`, `sol_mnemonic`, `ton_mnemonic` and `mnemonic_encrypted` throw
  `WebKeyMaterialUnsupportedError`. Wallet generation fails with a legible
  message instead of writing a recovery phrase into `localStorage`.
- Only the session token, Account ID, biometric preference and push token are
  stored.

Consequence: on web you can review and drive the UI up to wallet generation, but
**a real device is required to create a wallet, unlock with biometrics, or
receive a push notification.** `lib/polyfills.ts` also has to avoid assigning to
`window.crypto`, which is a getter-only accessor in browsers — doing so throws in
strict mode and takes the whole bundle down.

## Notes

- WSL2/LAN dev: use `--lan`, not `--tunnel` (tunnel mode doesn't work in this setup)
- Renamed Avora → Zomavi → Ulmara; `app.json` bundle IDs are `com.biggestmanuel.ulmara`
- **`react-native-fast-pbkdf2` needs a rebuilt dev client.** The native `Pbkdf2` module must be compiled into the binary (it's not in Expo Go, and dev clients built before it was added don't have it). If it's missing, TON key derivation (`mnemonicToWalletKey` → `@ton/crypto-primitives`, see `patches/@ton+crypto-primitives+2.1.0.patch`) crashes with "Cannot read property 'derive' of null" — the patch detects this and falls back to a pure-JS PBKDF2, but rebuild the dev client (`npx expo prebuild && npm run android`) to get the native path. TON only runs ~390 PBKDF2 iterations, so the JS fallback is fast.