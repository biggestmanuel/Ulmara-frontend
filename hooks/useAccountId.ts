import { useCallback, useState } from 'react';
import { useUserStore } from '../stores/userStore';

async function resolveAccountIdApi(id: string): Promise<ResolvedProfile> {
  const response = await fetch(`/api/account-id/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error('Failed to resolve Account ID');
  }

  return (await response.json()) as ResolvedProfile;
}

// Assumes userStore exposes: accountId, profile, hydrate()
// Assumes lib/api/accountId exports resolveAccountId(id: string)

interface ResolvedProfile {
  accountId: string;
  displayName: string;
  photoUrl?: string;
  supportedChains: string[];
}

export function useAccountId() {
  const { accountId, profile } = useUserStore();

  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const resolve = useCallback(async (id: string): Promise<ResolvedProfile | null> => {
    setResolving(true);
    setResolveError(null);
    try {
      const result = await resolveAccountIdApi(id);
      return result;
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Failed to resolve Account ID');
      return null;
    } finally {
      setResolving(false);
    }
  }, []);

  return {
    accountId,
    profile,
    resolve,
    resolving,
    resolveError,
  };
}
