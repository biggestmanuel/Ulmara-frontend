import { apiClient } from '../api/client';

// Client-side entry point for gas abstraction. The actual sponsor-wallet
// signing happens server-side (GAS_SPONSOR_PRIVATE_KEY never ships to the app).
// This just requests a sponsored tx and gets back what will be deducted
// from the user's balance in-kind.
//
// ## Switched off
//
// The backend defines no `/gas/quote` and no `/gas/submit`, and neither is
// being added, so both requests could only ever fail. `EXPO_PUBLIC_GAS_SPONSOR`
// turns them back on if that changes; it is off by default.
//
// The functions throw rather than returning a plausible-looking quote, because
// a fabricated "your fee will be 0.02 ETH" is worse than an error: a caller
// would have no way to tell it was invented. Nothing in the app imports this
// module today, so no screen depends on it.
const GAS_SPONSOR_ENABLED = process.env.EXPO_PUBLIC_GAS_SPONSOR === 'true';

export interface GasSponsorQuote {
  network: string;
  nativeFeeEstimate: string;
  equivalentDeductionAsset: string;
  equivalentDeductionAmount: string;
}

export async function getGasSponsorQuote(params: {
  network: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
}): Promise<GasSponsorQuote> {
  if (!GAS_SPONSOR_ENABLED) {
    throw new Error('Gas sponsorship is unavailable: the backend has no /gas/quote route.');
  }
  const { data } = await apiClient.post<GasSponsorQuote>('/gas/quote', params);
  return data;
}

export interface SponsoredTxResult {
  txHash: string;
  status: 'submitted' | 'failed';
}

export async function submitSponsoredTransaction(params: {
  network: string;
  signedPayload: string;
}): Promise<SponsoredTxResult> {
  if (!GAS_SPONSOR_ENABLED) {
    throw new Error('Gas sponsorship is unavailable: the backend has no /gas/submit route.');
  }
  const { data } = await apiClient.post<SponsoredTxResult>('/gas/submit', params);
  return data;
}
