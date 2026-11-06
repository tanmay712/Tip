import { logger } from "../utils/logger.js";

interface PriceCache {
  price: number;
  change24h: number;
  fetchedAt: number;
}

const cache = new Map<string, PriceCache>();
const CACHE_TTL_MS = 60_000; // 1 minute

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  POL: "matic-network",
  MATIC: "matic-network",
  SOL: "solana",
  AVAX: "avalanche-2",
  ARB: "arbitrum",
  OP: "optimism",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  LINK: "chainlink",
  WETH: "weth",
  BTC: "bitcoin",
  LTC: "litecoin",
};

export interface PriceInfo {
  symbol: string;
  price: number;
  change24h: number;
}

export async function getPrice(symbol: string): Promise<PriceInfo | null> {
  const upper = symbol.toUpperCase();
  const cached = cache.get(upper);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { symbol: upper, price: cached.price, change24h: cached.change24h };
  }

  const coingeckoId = COINGECKO_IDS[upper];
  if (!coingeckoId) {
    return null;
  }

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`,
    );
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const info = data[coingeckoId];
    if (!info) return null;

    const entry: PriceCache = {
      price: info.usd ?? 0,
      change24h: info.usd_24h_change ?? 0,
      fetchedAt: Date.now(),
    };
    cache.set(upper, entry);

    return { symbol: upper, price: entry.price, change24h: entry.change24h };
  } catch (err) {
    logger.error({ err, symbol }, "Price fetch failed");
    return cached
      ? { symbol: upper, price: cached.price, change24h: cached.change24h }
      : null;
  }
}

export async function getPrices(
  symbols: string[],
): Promise<Map<string, PriceInfo>> {
  const results = new Map<string, PriceInfo>();
  const promises = symbols.map(async (s) => {
    const info = await getPrice(s);
    if (info) results.set(s.toUpperCase(), info);
  });
  await Promise.allSettled(promises);
  return results;
}
