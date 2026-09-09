import axios from 'axios';

// CoinGecko API key — move this to EXPO_PUBLIC_COINGECKO_API_KEY in .env
// rather than hardcoding, then reference process.env here.
const API_KEY = process.env.EXPO_PUBLIC_COINGECKO_API_KEY ?? '';

const client = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  timeout: 8000,
  headers: API_KEY ? { 'x-cg-demo-api-key': API_KEY } : {},
});

// Maps our internal symbols to CoinGecko coin ids.
export const COINGECKO_IDS = {
  ETH: 'ethereum',
  BNB: 'binancecoin',
  POL: 'matic-network',
  SOL: 'solana',
  TRX: 'tron',
  TON: 'the-open-network',
  BTC: 'bitcoin',
  USDT: 'tether',
  USDC: 'usd-coin',
} as const;

export type PriceSymbol = keyof typeof COINGECKO_IDS;

interface CacheEntry {
  data: Record<string, number>;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 45_000; // 45s — frequent enough to feel live, gentle on rate limits

// Fetches USD prices for the given symbols, using a short-lived cache so
// rapid re-renders (e.g. typing an amount) don't hammer the API.
export async function getUsdPrices(symbols: PriceSymbol[]): Promise<Record<PriceSymbol, number>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return pickFromCache(symbols, cache.data);
  }

  const ids = Array.from(new Set(symbols.map((s) => COINGECKO_IDS[s]))).join(',');
  const { data } = await client.get('/simple/price', {
    params: { ids, vs_currencies: 'usd' },
  });

  const flat: Record<string, number> = {};
  for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
    if (data[id]?.usd != null) flat[symbol] = data[id].usd;
  }

  cache = { data: flat, fetchedAt: now };
  return pickFromCache(symbols, flat);
}

function pickFromCache(
  symbols: PriceSymbol[],
  data: Record<string, number>
): Record<PriceSymbol, number> {
  const result = {} as Record<PriceSymbol, number>;
  for (const s of symbols) result[s] = data[s] ?? 0;
  return result;
}

// Convenience: convert a native-asset amount to USD.
export async function toUsd(symbol: PriceSymbol, amount: number): Promise<number> {
  const prices = await getUsdPrices([symbol]);
  return amount * (prices[symbol] ?? 0);
}

// Convenience: convert a USD amount to NGN using a live USD->NGN rate.
// CoinGecko doesn't do fiat-to-fiat directly, so we piggyback on a
// stablecoin (USDT) priced in NGN as a practical USD proxy.
export async function usdToNgn(usdAmount: number): Promise<number> {
  const { data } = await client.get('/simple/price', {
    params: { ids: 'tether', vs_currencies: 'ngn' },
  });
  const rate = data?.tether?.ngn ?? 0;
  return usdAmount * rate;
}
