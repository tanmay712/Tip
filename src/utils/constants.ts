export const BRAND = {
  name: "Hodlr",
  color: 0x00d4aa,
  icon: "https://avatars.githubusercontent.com/u/97213385?v=4",
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
