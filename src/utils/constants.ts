export const PREFIX = "$";

export const BRAND = {
  name: "Hodlr",
  color: 0x00d4aa,
  icon: "https://i.ibb.co/qYZX9N8x/grok-image-1775350673726.jpg",
  tagline: "Tip crypto. Instantly.",
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
  } as Record<string, string>,
};

export const EMOJIS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  loading: "⏳",
  tip: "💸",
  rain: "🌧️",
  airdrop: "🪂",
  wallet: "👛",
  deposit: "📥",
  withdraw: "📤",
  history: "📜",
  leaderboard: "🏆",
  price: "📊",
  network: "🌐",
  mainnet: "🟢",
  testnet: "🟡",
} as const;

export const TXN_TYPES = {
  TIP: "tip",
  RAIN: "rain",
  AIRDROP: "airdrop",
  DEPOSIT: "deposit",
  WITHDRAW: "withdraw",
} as const;
