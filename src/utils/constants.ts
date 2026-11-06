import { CUSTOM_EMOJIS } from "./custom-emojis.generated.js";

export const PREFIX = "$";

export const BRAND = {
  name: "Crypto",
  color: 0x00d4aa,
  tagline: "Crypto tips. Across chains.",
} as const;

export const LIMITS = {
  maxRainRecipients: 50,
  maxAirdropSlots: 100,
  airdropExpiryMinutes: 60,
  minTipAmount: "0.000001",
  maxHistoryPerPage: 10,
  rateLimitPerMinute: 10,
  depositPollIntervalMs: 60_000,
} as const;

/**
 * Security thresholds.
 *
 * All raw amounts are strings representing the integer smallest-unit value
 * (wei for EVM, lamports for Solana). Use BigInt() to compare them.
 *
 * minDepositRaw:    ignore any incoming deposit below this — dust/spam protection.
 * largeDepositRaw:  post a Discord security alert for deposits above this.
 * largeWithdrawRaw: post a Discord security alert for withdrawals above this.
 */
export const SECURITY_LIMITS = {
  minDepositRaw: {
    // EVM chains — 0.00001 native token
    ethereum:  "10000000000000",      // 0.00001 ETH
    arbitrum:  "10000000000000",      // 0.00001 ETH
    optimism:  "10000000000000",      // 0.00001 ETH
    base:      "10000000000000",      // 0.00001 ETH
    zksync:    "10000000000000",      // 0.00001 ETH
    avalanche: "1000000000000000",    // 0.001 AVAX
    polygon:   "100000000000000000",  // 0.1 POL
    // Solana — 0.001 SOL
    solana:    "1000000",             // 0.001 SOL (1,000,000 lamports)
    // Litecoin — 0.0001 LTC (litoshi)
    litecoin:  "10000",
  } as Record<string, string>,

  largeDepositRaw: {
    // EVM — 0.1 ETH / 0.1 native equivalent
    ethereum:  "100000000000000000",        // 0.1 ETH
    arbitrum:  "100000000000000000",        // 0.1 ETH
    optimism:  "100000000000000000",        // 0.1 ETH
    base:      "100000000000000000",        // 0.1 ETH
    zksync:    "100000000000000000",        // 0.1 ETH
    avalanche: "5000000000000000000",       // 5 AVAX
    polygon:   "10000000000000000000000",   // 10,000 POL
    solana:    "1000000000",                // 1 SOL
    litecoin:  "1000000000",                // 10 LTC
  } as Record<string, string>,

  largeWithdrawRaw: {
    ethereum:  "100000000000000000",        // 0.1 ETH
    arbitrum:  "100000000000000000",        // 0.1 ETH
    optimism:  "100000000000000000",        // 0.1 ETH
    base:      "100000000000000000",        // 0.1 ETH
    zksync:    "100000000000000000",        // 0.1 ETH
    avalanche: "5000000000000000000",       // 5 AVAX
    polygon:   "10000000000000000000000",   // 10,000 POL
    solana:    "1000000000",                // 1 SOL
    litecoin:  "500000000",                 // 5 LTC
  } as Record<string, string>,
};

const emoji = (name: string, fallback: string): string => CUSTOM_EMOJIS[name] ?? fallback;

/** Application emoji mentions take precedence when the matching image was uploaded. */
export const EMOJIS = {
  success: emoji("success", "✅"),
  error: emoji("error", "❌"),
  warning: emoji("warning", "⚠️"),
  loading: emoji("loading", "⏳"),
  tip: emoji("tip", "💸"),
  rain: emoji("rain", "🌧️"),
  airdrop: emoji("airdrop", "🪂"),
  wallet: emoji("wallet", "👛"),
  deposit: emoji("deposit", "📥"),
  withdraw: emoji("withdraw", "📤"),
  history: emoji("history", "📜"),
  leaderboard: emoji("leaderboard", "🏆"),
  price: emoji("price", "📊"),
  network: emoji("network", "🌐"),
  mainnet: emoji("mainnet", "🟢"),
  testnet: emoji("testnet", "🟡"),
} as const;

export const TXN_TYPES = {
  TIP: "tip",
  RAIN: "rain",
  AIRDROP: "airdrop",
  DEPOSIT: "deposit",
  WITHDRAW: "withdraw",
} as const;
