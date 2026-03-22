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

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: process.env.DISCORD_GUILD_ID || null,
  },
  alchemy: {
    apiKey: required("ALCHEMY_API_KEY"),
    webhookSigningKey: process.env.ALCHEMY_WEBHOOK_SIGNING_KEY || "",
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
