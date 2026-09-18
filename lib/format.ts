// Shared display formatter for the 10-digit Account ID (e.g. 0123 456 789).
// Lives in one place — it was previously pasted into home, profile and
// create-account-id and drifted copy-paste style.
export function formatAccountId(id?: string | null): string {
  if (!id) return '---- --- ---';
  return id.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
}
