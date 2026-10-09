import axios from 'axios';

// CoinGecko Demo API key — move this to EXPO_PUBLIC_COINGECKO_API_KEY in .env
// rather than hardcoding, then reference process.env here.
// Demo tier auth is a QUERY PARAM (x_cg_demo_api_key), not a header.
const API_KEY = process.env.EXPO_PUBLIC_COINGECKO_API_KEY ?? '';

const client = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  timeout: 8000,
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
/**
 * USD prices for the requested symbols.
 *
 * **Partial on purpose.** A symbol that could not be priced is absent from the
 * record rather than present with a `0`, because "no price" and "worth nothing"
 * are different facts and only one of them is a safe thing to render. Every
 * consumer here treats absence as unknown already; see `pickFromCache`.
 */
export async function getUsdPrices(
  symbols: PriceSymbol[]
): Promise<Partial<Record<PriceSymbol, number>>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return pickFromCache(symbols, cache.data);
  }

  const ids = Array.from(new Set(symbols.map((s) => COINGECKO_IDS[s]))).join(',');
  const { data } = await client.get('/simple/price', {
    params: { ids, vs_currencies: 'usd', x_cg_demo_api_key: API_KEY },
  });

  const flat: Record<string, number> = {};
  for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
    if (data[id]?.usd != null) flat[symbol] = data[id].usd;
  }

  cache = { data: flat, fetchedAt: now };
  return pickFromCache(symbols, flat);
}

/**
 * A symbol we asked about but could not price is **absent from the record**,
 * not present-and-zero.
 *
 * This used to be `result[s] = data[s] ?? 0`, which turned a failed lookup into a
 * real zero. Every consumer already treats `undefined` as "unknown" and renders
 * something honest — `usePortfolioValue` counts it as missing and reports `null`
 * rather than a total, and `usdValueOf` returns `null` — so the zero was
 * silently defeating code that was written to handle exactly this case. The
 * caller could never tell "priced at zero" from "we have no idea", and a genuine
 * zero does not need special handling because it arrives as `0` from the API.
 *
 * Note the ordering effect this has on the cache: a symbol that fails is simply
 * not written, so the next read through the same cache misses it again rather
 * than being pinned to a fabricated value.
 */
function pickFromCache(
  symbols: PriceSymbol[],
  data: Record<string, number>
): Partial<Record<PriceSymbol, number>> {
  const result: Partial<Record<PriceSymbol, number>> = {};
  for (const s of symbols) {
    const price = data[s];
    if (price !== undefined) result[s] = price;
  }
  return result;
}

/**
 * Convert a native-asset amount to USD.
 *
 * Returns `null` when the price is unknown. It used to return `amount * 0`,
 * which reported a holding as worth exactly nothing — the same fabricated zero,
 * one function call further from the source.
 */
export async function toUsd(symbol: PriceSymbol, amount: number): Promise<number | null> {
  const prices = await getUsdPrices([symbol]);
  const price = prices[symbol];
  if (price === undefined) return null;
  return amount * price;
}

// Convenience: convert a USD amount to NGN using a live USD->NGN rate.
// CoinGecko doesn't do fiat-to-fiat directly, so we piggyback on a
// stablecoin (USDT) priced in NGN as a practical USD proxy.
export async function usdToNgn(usdAmount: number): Promise<number | null> {
  const { data } = await client.get('/simple/price', {
    params: { ids: 'tether', vs_currencies: 'ngn', x_cg_demo_api_key: API_KEY },
  });
  // The same fabricated zero as `pickFromCache`, one function over. A rate we
  // could not read is not a rate of zero, and returning one would put a genuine
  // ₦0 on the withdraw screen.
  const rate = data?.tether?.ngn;
  if (rate === undefined || rate === null) return null;
  return usdAmount * rate;
}
