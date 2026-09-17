/**
 * Bitcoin is included in the account and asset model. UTXO discovery is
 * backend-owned, so a missing backend balance is reported explicitly rather
 * than querying an unauthenticated third-party explorer.
 */
export async function getBalance(_address: string): Promise<string> {
  throw new Error('Bitcoin balance is not available from the configured wallet API');
}
