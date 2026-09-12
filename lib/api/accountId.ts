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

// Server generates and immediately persists a new Account ID for the logged-in
// user (auth required). There is no separate "reserve/preview" step and no way
// to pick your own ID — calling this a second time for the same user 409s.
export async function createAccountId(): Promise<{ id: string; accountId: string; userId: string }> {
  const { data } = await apiClient.post<ApiEnvelope<{ id: string; accountId: string; userId: string }>>(
    '/api/account/create-account-id'
  );
  return data.data;
}

export async function getMe(): Promise<any> {
  const { data } = await apiClient.get<ApiEnvelope<any>>('/api/account/me');
  return data.data;
}

export async function updateSettings(
  patch: Partial<{
    name: string;
    photoUrl: string;
    defaultCurrency: string;
    defaultLanguage: string;
    defaultNetwork: string | null;
  }>
): Promise<any> {
  const { data } = await apiClient.patch<ApiEnvelope<any>>('/api/account/settings', patch);
  return data.data;
}
