# Ulmara — Frontend

Non-custodial multi-chain crypto wallet. Send and receive using a 10-digit Account ID instead of a raw blockchain address — PalmPay/OPay-style simplicity with self-custody underneath.

## Stack

- React Native + Expo (`expo-router`)
- Zustand for state (`stores/`)
- Chains: TON, BSC, ETH, SOL, Base, Polygon, TRON (`@ton/*`, `ethers`, `@solana/web3.js`, `tronweb`)
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
  ramp/               fiat on/off-ramp integration
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
EXPO_PUBLIC_TRIVERIFY_API_KEY=
EXPO_PUBLIC_BACHS_API_KEY=          # primary NGN ramp
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=    # fallback ramp
EXPO_PUBLIC_FLUTTERWAVE_PUBLIC_KEY= # fallback ramp
```

`GAS_SPONSOR_PRIVATE_KEY` is backend-only — never expose it as `EXPO_PUBLIC_*`.

## Scripts

```bash
npm run start       # expo start
npm run android
npm run ios
npm run web
npm run lint
npm run typecheck
```

## Status

- tsc / lint clean
- Theme rollout (burnt-orange, ~20 screens) done
- Receipt sharing done
- External-wallet address validation redesign blocked on a TriVerify API change (infer-network → confirm-match-selected-network)
- ERC-20/USDT token support not yet implemented (native coins only)

## Notes

- WSL2/LAN dev: use `--lan`, not `--tunnel` (tunnel mode doesn't work in this setup)
- Renamed Avora → Zomavi → Ulmara; `app.json` bundle IDs are `com.biggestmanuel.ulmara`