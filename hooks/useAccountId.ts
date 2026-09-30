import { useCallback, useState } from 'react';
import { useUserStore } from '../stores/userStore';
import { resolveAccountId, type AccountIdProfile } from '../lib/api/accountId';
import { friendlyError } from '../lib/api/client';

/**
 * Resolves an Account ID to its public profile for the send flow.
 *
 * This used to call `fetch('/api/account-id/...')` directly. That was wrong in
 * three ways at once and would have failed on a real device:
 *   - a relative URL resolves against the Metro dev-server origin, not the API;
 *   - `EXPO_PUBLIC_API_BASE_URL` was ignored entirely;
 *   - no `Authorization` header, so the call would be rejected as unauthenticated.
 *
 * It is also unused — `app/send/index.tsx` goes through
 * `resolveAccountIdForTransfer` from `lib/api/accountId` — but it is left here
 * delegating to that module rather than deleted, so that wiring it up later
 * cannot reintroduce the bug.
 */
export type ResolvedProfile = AccountIdProfile;

export function useAccountId() {
  const { accountId, profile } = useUserStore();

  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const resolve = useCallback(async (id: string): Promise<ResolvedProfile | null> => {
    setResolving(true);
    setResolveError(null);
    try {
      // A 404 is "no such Account ID", not a failure — resolveAccountId maps
      // that to null, which the send screen renders as "not found".
      return await resolveAccountId(id);
    } catch (err) {
      setResolveError(friendlyError(err, 'Failed to resolve Account ID'));
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
