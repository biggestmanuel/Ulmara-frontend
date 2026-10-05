import { apiClient } from './client';

/**
 * One wallet as `GET /api/account/resolve/{accountId}` returns it.
 *
 * `address` is guaranteed on this one. `/api/account/{accountId}` omits it
 * entirely — see `ProfileWalletChain`.
 */
export interface ProfileWallet {
  chain: string;
  address: string;
}

/**
 * One wallet as `GET /api/account/{accountId}` returns it: **chain only**.
 *
 * There is no `address` key on these objects, at all. That is not a case where
 * the value happens to be absent — reading `.address` yields `undefined`, under
 * a type that used to promise `string`. Measured on the live backend across two
 * accounts: eight wallets each, and the key set is exactly `('chain',)` every
 * time, versus `('address', 'chain')` on the `/resolve/` variant.
 *
 * The two shapes are stable, so they are two types rather than one optional
 * field. Making `address` optional on a shared type would have been the wrong
 * fix: it would also weaken `resolveAccountIdForTransfer`, whose callers
 * genuinely rely on `address` being there.
 */
export interface ProfileWalletChain {
  chain: string;
}

/** The public half of a profile, common to both endpoints. */
export interface AccountIdProfile {
  accountId: string;
  name?: string;
  photoUrl?: string;
}

/**
 * What `GET /api/account/{accountId}` answers with: a profile whose wallets
 * carry a chain and nothing else.
 *
 * Use `AccountIdProfileWithWallets` instead if you need addresses — this
 * endpoint will not give them to you, and pretending otherwise is what the old
 * single `AccountIdProfile` type did.
 */
export type AccountIdProfileWithWallets = AccountIdProfile & {
  wallets?: ProfileWalletChain[];
};

/**
 * What `GET /api/account/resolve/{accountId}` answers with: a profile whose
 * wallets carry a chain **and** an address.
 *
 * This is the one the send flow needs, and the only one that has addresses.
 */
export type AccountIdProfileWithAddresses = AccountIdProfile & {
  wallets?: ProfileWallet[];
};

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * Shared envelope for both profile endpoints. The wallet shape is the only thing
 * that differs between them, so it is a parameter rather than a second
 * hand-written envelope that could drift.
 */
interface ProfileEnvelope<W> {
  accountId: string;
  profile: {
    id: string;
    name: string | null;
    photoUrl: string | null;
    wallets?: W[];
  };
}

// Resolve a 10-digit Account ID to its public profile.
//
// Note the endpoint difference from `resolveAccountIdForTransfer` below: this one
// returns `wallets` with a chain and **no address**. The return type says so, so
// a caller that needs an address cannot reach for it here and find `undefined`.
//
// Returns null if no account exists with that ID (not an error state).
export async function resolveAccountId(accountId: string): Promise<AccountIdProfileWithWallets | null> {
  try {
    const { data } = await apiClient.get<ApiEnvelope<ProfileEnvelope<ProfileWalletChain>>>(
      `/api/account/${accountId}`
    );
    const { accountId: id, profile } = data.data;
    return { accountId: id, name: profile?.name ?? undefined, photoUrl: profile?.photoUrl ?? undefined, wallets: profile?.wallets };
  } catch (err: any) {
    if (err?.status === 404) return null;
    throw err;
  }

}

/**
 * Resolve a 10-digit Account ID for a transfer: the profile plus each of the
 * recipient's wallets with a chain **and** an address.
 *
 * This is the only one of the two that has addresses, which is why the send
 * flow uses it and `resolveAccountId` does not. Resolving your own Account ID is
 * refused with a 400 ("Cannot resolve your own Account ID for transfer"); a 404
 * is mapped to `null`.
 */
export async function resolveAccountIdForTransfer(accountId: string): Promise<AccountIdProfileWithAddresses | null> {
  try {
    const { data } = await apiClient.get<ApiEnvelope<ProfileEnvelope<ProfileWallet>>>(
      `/api/account/resolve/${accountId}`
    );
    const { accountId: id, profile } = data.data;
    return { accountId: id, name: profile?.name ?? undefined, photoUrl: profile?.photoUrl ?? undefined, wallets: profile?.wallets };
  } catch (err: any) {
    if (err?.status === 404) return null;
    throw err;
  }
}

// Server generates and immediately persists a new Account ID for the logged-in
// user (auth required). There is no separate "reserve/preview" step and no way
// to pick your own ID — calling this a second time for the same user 409s.
export async function createAccountId(): Promise<{ id: string; accountId: string; userId: string }> {
  const { data } = await apiClient.post<ApiEnvelope<{ id: string; accountId: string; userId: string }>>(
    '/api/account/create-account-id'
  );
  return data.data;
}

/**
 * The caller's own account, from `GET /api/account/me`.
 *
 * `accountId` is an **object**, not a string: `{ id, accountId, userId,
 * createdAt }`. The 10-digit ID is at `.accountId.accountId`. Reading the
 * property directly yields the object, so anything that stringifies it — a
 * template literal, `String()`, a comparison against digits — gets
 * `[object Object]`.
 *
 * It was `Promise<any>` before, which is why that shape was never checked by
 * anything. `login.tsx` and `create-account-id.tsx` reach for
 * `me?.accountId?.accountId`, and `userStore.hydrate()` never reads the field at
 * all — it hydrates from SecureStore — so a change here would have degraded
 * quietly rather than failing loudly. The interface is what makes the next
 * change visible.
 */
export interface MeAccountId {
  /** Row id of the AccountId record. Not the 10-digit public ID. */
  id: string;
  /** The 10-digit Ulmara Account ID. */
  accountId: string;
  userId: string;
  createdAt: string;
}

export interface MeProfile {
  id: string;
  email: string;
  phone: string | null;
  name: string | null;
  photoUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  biometricEnabled: boolean;
  twoFactorEnabled: boolean;
  pinFailedAttempts: number;
  pinLockedUntil: string | null;
  defaultCurrency: string;
  defaultLanguage: string;
  defaultNetwork: string | null;
  createdAt: string;
  updatedAt: string;
  /** An object, not a string. See `MeAccountId`. */
  accountId: MeAccountId | null;
}

export async function getMe(): Promise<MeProfile> {
  const { data } = await apiClient.get<ApiEnvelope<MeProfile>>('/api/account/me');
  return data.data;
}

/**
 * A settings patch.
 *
 * Three states per field, and they are not interchangeable:
 *
 *  - **key absent** — leave the value alone;
 *  - **`string`** — set it;
 *  - **`null`** — clear it, and only where the column is nullable.
 *
 * Verified against the live backend. `{"defaultNetwork": null}` clears it;
 * omitting `defaultNetwork` does not; and `{"name": ""}` is rejected, so a blank
 * string is never the way to clear anything. `defaultCurrency` and
 * `defaultLanguage` refuse `null` outright — they are `NOT NULL` with defaults,
 * so they have no unset state.
 *
 * This is why the fields are `?: string | null` rather than wrapped in
 * `Partial<>`: `Partial` permits `{ name: undefined }`, and `undefined` is
 * dropped during serialisation, so a caller meaning "clear this" would silently
 * leave the value alone instead. The distinction has to be in the type.
 */
export interface SettingsPatch {
  /** Nullable. `null` clears it. */
  name?: string | null;
  /** Nullable. `null` clears it. */
  photoUrl?: string | null;
  /** `NOT NULL` with a default — `null` is refused, omit to leave alone. */
  defaultCurrency?: string;
  /** `NOT NULL` with a default — `null` is refused, omit to leave alone. */
  defaultLanguage?: string;
  /** Nullable, and UPPERCASE from the backend's CHAIN_NAMES enum. `null` clears it. */
  defaultNetwork?: string | null;
}

/**
 * The user row as `PATCH /api/account/settings` returns it.
 *
 * Three fields `GET /api/account/me` carries are **absent** here:
 * `accountId`, `pinFailedAttempts` and `pinLockedUntil`. Measured live across
 * four different patches (`name` set, `name` cleared, `defaultCurrency` set,
 * `photoUrl` cleared): always 14 keys, always those three missing, and never a
 * key the patch did not touch. So this is a narrower *row*, not a
 * patch-shaped echo — nothing here depends on which fields were sent.
 *
 * Declared as an `Omit` rather than spelled out, deliberately: if `MeProfile`
 * later gains a field the PATCH does return, it flows through automatically,
 * and if it gains one the PATCH does *not* return, the compiler points at this
 * line instead of letting a `undefined` reach a screen.
 *
 * If you need a complete profile after saving settings, call `getMe()` — do not
 * assume the patch response carries the Account ID.
 */
export type MeProfileAfterSettingsPatch = Omit<
  MeProfile,
  'accountId' | 'pinFailedAttempts' | 'pinLockedUntil'
>;

/**
 * PATCH /api/account/settings — answers with the updated user row, **narrower
 * than `getMe()`**. See `MeProfileAfterSettingsPatch`.
 */
export async function updateSettings(patch: SettingsPatch): Promise<MeProfileAfterSettingsPatch> {
  const { data } = await apiClient.patch<ApiEnvelope<MeProfileAfterSettingsPatch>>('/api/account/settings', patch);
  return data.data;
}
