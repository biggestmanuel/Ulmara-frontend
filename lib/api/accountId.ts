import { apiClient } from './client';

export interface AccountIdProfile {
  accountId: string;
  name?: string;
  photoUrl?: string;
  wallets?: { chain: string; address: string }[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// Resolve a 10-digit Account ID to its public profile.
// Returns null if no account exists with that ID (not an error state).
export async function resolveAccountId(accountId: string): Promise<AccountIdProfile | null> {
  try {
    const { data } = await apiClient.get<
      ApiEnvelope<{ accountId: string; profile: { id: string; name: string | null; photoUrl: string | null; wallets?: { chain: string; address: string }[] } }>
    >(`/api/account/${accountId}`);
    const { accountId: id, profile } = data.data;
    return { accountId: id, name: profile?.name ?? undefined, photoUrl: profile?.photoUrl ?? undefined, wallets: profile?.wallets };
  } catch (err: any) {
    if (err?.status === 404) return null;
    throw err;
  }

}

export async function resolveAccountIdForTransfer(accountId: string): Promise<AccountIdProfile | null> {
  try {
    const { data } = await apiClient.get<
      ApiEnvelope<{ accountId: string; profile: { id: string; name: string | null; photoUrl: string | null; wallets?: { chain: string; address: string }[] } }>
    >(`/api/account/resolve/${accountId}`);
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

/** PATCH /api/account/settings — answers with the updated user row. */
export async function updateSettings(patch: SettingsPatch): Promise<MeProfile> {
  const { data } = await apiClient.patch<ApiEnvelope<MeProfile>>('/api/account/settings', patch);
  return data.data;
}
