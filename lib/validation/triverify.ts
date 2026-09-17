import { apiClient } from '../api/client';

export type SupportedTriVerifyChain =
  | 'ETH' | 'BTC' | 'SOL' | 'TRON' | 'SUI' | 'TON'
  | 'BSC' | 'BASE' | 'POLYGON';

export interface AddressValidationResult {
  address: string;
  chain: SupportedTriVerifyChain;
  formatValid: boolean;
  exists: boolean | null;
}

/**
 * Validate through the authenticated backend proxy. TriVerify credentials
 * must never be bundled in the mobile application.
 */
export async function validateExternalAddress(
  address: string,
  chain: SupportedTriVerifyChain
): Promise<AddressValidationResult> {
  const { data } = await apiClient.post<{ data: AddressValidationResult }>(
    '/api/validation/address',
    { address, chain },
  );
  return data.data;
}
