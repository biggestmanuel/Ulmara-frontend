import axios from 'axios';

const apiKey = process.env.EXPO_PUBLIC_TRIVERIFY_API_KEY ?? '';
const baseUrl = 'https://api.tribridge.tech/v1';

export type SupportedTriVerifyChain = 'ETH' | 'BTC' | 'SOL' | 'TRON' | 'SUI' | 'TON';

export interface AddressValidationResult {
  address: string;
  chain: SupportedTriVerifyChain;
  formatValid: boolean;
  exists: boolean | null;
}

const triVerifyClient = axios.create({
  baseURL: baseUrl,
  timeout: 8000,
  headers: { Authorization: `Bearer ${apiKey}` },
});

export async function validateExternalAddress(
  address: string,
  chain: SupportedTriVerifyChain
): Promise<AddressValidationResult> {
  const { data } = await triVerifyClient.post('/validate', { address, chain });
  return {
    address,
    chain,
    formatValid: data.formatValid,
    exists: data.exists ?? null,
  };
}
