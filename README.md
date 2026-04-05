# Hodlr

> Tip crypto. Instantly.

A Discord crypto tipping bot powered by [Alchemy](https://www.alchemy.com/). Send tips, rain tokens, create airdrops, deposit and withdraw across **8 blockchains** with full **testnet** and **mainnet** support.

---

## Features

| Feature | Slash | Prefix | Description |
|---------|-------|--------|-------------|
| Tip | `/tip` | `$tip` | Instant off-chain tips between users |
| Rain | `/rain` | `$rain` | Distribute tokens to active members |
| Airdrop | `/airdrop` | — | First-come-first-served claim drops |
| Wallet | `/wallet` | `$wallet` | View, deposit, and withdraw |
| Balance | `/balance` | `$balance` | On-chain + internal balances |
| History | `/history` | — | Transaction history with filters |
| Leaderboard | `/leaderboard` | `$leaderboard` | Top tippers |
| Price | `/price` | `$price` | Live token prices with 24h change |
| Network | `/network` | `$network` | Toggle mainnet / testnet |
| Help | `/help` | `$help` | Command reference |

## Supported Chains

| Chain | Mainnet | Testnet | Native |
|-------|---------|---------|--------|
| Ethereum | ✅ | Sepolia | ETH |
| Polygon | ✅ | Amoy | POL |
| Arbitrum | ✅ | Sepolia | ETH |
| Optimism | ✅ | Sepolia | ETH |
| Base | ✅ | Sepolia | ETH |
| zkSync | ✅ | Sepolia | ETH |
| Avalanche | ✅ | Fuji | AVAX |
| Solana | ✅ | Devnet | SOL |

## How Deposits Work

Deposits are detected automatically — no webhook setup required. The bot polls every 60 seconds using Alchemy's `getAssetTransfers` API for all registered wallet addresses. Duplicate transactions are filtered by hash so nothing gets credited twice. Alchemy webhooks are still supported if you want real-time detection (`ALCHEMY_WEBHOOK_SIGNING_KEY` + POST `/webhooks/alchemy`).

## Quick Start

```bash
git clone https://github.com/HiLleywyn/hodlr.git
cd hodlr
npm install
cp .env.example .env
```

Edit `.env` — minimum required:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
ALCHEMY_API_KEY=
ENCRYPTION_SECRET=   # openssl rand -hex 32
```

```bash
npx prisma db push
npm run deploy-commands
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | — | Application Client ID |
| `DISCORD_GUILD_ID` | No | — | Dev mode: restrict commands to one guild |
| `ALCHEMY_API_KEY` | Yes | — | Alchemy API key |
| `ALCHEMY_WEBHOOK_SIGNING_KEY` | No | — | Optional: verify incoming Alchemy webhooks |
| `ENCRYPTION_SECRET` | Yes | — | 32-byte hex string for AES-256-GCM key encryption |
| `DATABASE_URL` | No | `file:/app/data/hodlr.db` | SQLite or Postgres URL |
| `API_PORT` | No | `3000` | HTTP server port |
| `API_HOST` | No | `0.0.0.0` | HTTP server host |
| `DEFAULT_NETWORK` | No | `mainnet` | Default network for new users |

Generate `ENCRYPTION_SECRET`:

```bash
openssl rand -hex 32
```

## Architecture

```
src/
├── index.ts              # Entry point — DB, API, poller, bot
├── config.ts             # Env config
├── bot/
│   ├── commands/         # 10 slash commands
│   ├── prefix/           # Prefix command router ($)
│   ├── events/           # ready, interactionCreate, messageCreate, guildMemberAdd
│   └── components/       # Embeds, buttons, pagination
├── core/                 # Business logic — tip, rain, airdrop, withdraw, deposit
├── blockchain/           # Alchemy SDK, ethers.js, Solana web3, providers
├── database/             # Prisma client + repositories
├── api/                  # Fastify — /health, /stats, /webhooks/alchemy
└── utils/                # Crypto, format, logger, rate-limit, constants
```

## Deployment

### Docker

```bash
docker-compose up -d
```

### Railway

1. Connect repo to [Railway](https://railway.app)
2. Set env vars in the Railway dashboard
3. Add a Volume mounted at `/app/data` (for SQLite persistence), or add the Postgres plugin
4. Deploy — uses `railway.toml` + `Dockerfile` automatically

### Manual

```bash
npm run build
npx prisma migrate deploy
npm start
```

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Liveness check |
| `GET` | `/stats` | None | User, wallet, transaction counts |
| `POST` | `/webhooks/alchemy` | HMAC-SHA256 | Real-time deposit events from Alchemy |

## Security

- Private keys encrypted at rest with **AES-256-GCM**
- Alchemy webhook payloads verified via HMAC-SHA256
- Per-user rate limiting: 10 commands/minute
- Sensitive replies (wallets, balances) are ephemeral
- Keys never leave the server

## Development

```bash
npm run dev           # Hot-reload dev server
npm run build         # TypeScript compile
npm run deploy-commands  # Register slash commands
npm run db:migrate    # Run Prisma migrations
npm run db:generate   # Regenerate Prisma client
npm run format        # Prettier
npm run lint          # ESLint
```

## License

Copyright (c) 2026 HiLleywyn. All Rights Reserved.

---

Built with [Discord.js](https://discord.js.org/) · [Alchemy SDK](https://www.alchemy.com/sdk) · [ethers.js](https://docs.ethers.org/) · [Prisma](https://www.prisma.io/) · [Fastify](https://fastify.dev/)
