import dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function litecoinApiBaseUrl(): string {
  const value = optional("LITECOIN_API_BASE_URL", "https://api.blockcypher.com/v1/ltc");
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error();
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("LITECOIN_API_BASE_URL must be an HTTPS URL without credentials, query, or fragment");
  }
}

function appBaseUrl(): string {
  const value = optional("APP_BASE_URL", "");
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function litecoinMaxWithdrawalFeeSatoshis(): number {
  const value = Number(process.env.LITECOIN_MAX_WITHDRAWAL_FEE_SATOSHIS || "1000000");
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000_000) {
    throw new Error("LITECOIN_MAX_WITHDRAWAL_FEE_SATOSHIS must be an integer from 1 to 100000000");
  }
  return value;
}

function litecoinConfirmations(): number {
  const value = Number(process.env.LITECOIN_CONFIRMATIONS || "6");
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error("LITECOIN_CONFIRMATIONS must be an integer from 1 to 100");
  }
  return value;
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    guildId: process.env.DISCORD_GUILD_ID || null,
  },
  dashboard: {
    baseUrl: appBaseUrl(),
    termsVersion: optional("TERMS_VERSION", "2026-11"),
    legalDocumentsApproved: optional("LEGAL_DOCUMENTS_APPROVED", "false") === "true",
    ownerDiscordIds: optional("OWNER_DISCORD_IDS", "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  },
  alchemy: {
    apiKey: required("ALCHEMY_API_KEY"),
    webhookSigningKey: process.env.ALCHEMY_WEBHOOK_SIGNING_KEY || "",
  },
  litecoin: {
    apiBaseUrl: litecoinApiBaseUrl(),
    blockCypherToken: process.env.LITECOIN_API_TOKEN || "",
    confirmations: litecoinConfirmations(),
    maxWithdrawalFeeSatoshis: litecoinMaxWithdrawalFeeSatoshis(),
  },
  encryption: {
    secret: required("ENCRYPTION_SECRET"),
  },
  database: {
    url: optional("DATABASE_URL", "file:/app/data/hodlr.db"),
  },
  api: {
    port: parseInt(process.env.PORT || optional("API_PORT", "3000"), 10),
    host: optional("API_HOST", "0.0.0.0"),
  },
  defaultNetwork: optional("DEFAULT_NETWORK", "mainnet") as
    | "mainnet"
    | "testnet",
} as const;
