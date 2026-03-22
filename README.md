# Hodlr

> Tip crypto. Instantly.

A modern Discord crypto tipping bot powered by [Alchemy](https://www.alchemy.com/). Send tips, rain tokens, and create airdrops across **8 blockchains** with full **testnet** and **mainnet** support.

---

## Features

| Feature | Description |
|---------|-------------|
| `/tip` | Send instant off-chain tips to any user |
| `/rain` | Distribute tokens to active channel members |
| `/airdrop` | Create first-come-first-served claim drops |
| `/wallet` | View deposit addresses across all chains |
| `/balance` | Check on-chain + internal balances |
| `/history` | Browse transaction history with filters |
| `/leaderboard` | See the top tippers |
| `/price` | Live token prices with 24h change |
| `/network` | Toggle between mainnet and testnet |
| `/help` | Command reference |

## Supported Chains

| Chain | Mainnet | Testnet | Native Token |
|-------|---------|---------|--------------|
| Ethereum | eth-mainnet | eth-sepolia | ETH |
| Polygon | polygon-mainnet | polygon-amoy | POL |
| Arbitrum | arb-mainnet | arb-sepolia | ETH |
| Optimism | opt-mainnet | opt-sepolia | ETH |
| Base | base-mainnet | base-sepolia | ETH |
| zkSync | zksync-mainnet | zksync-sepolia | ETH |
| Avalanche | avax-mainnet | avax-fuji | AVAX |
| Solana | solana-mainnet | solana-devnet | SOL |

## Quick Start

### Prerequisites

- Node.js 20+
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Alchemy API Key ([alchemy.com](https://www.alchemy.com/))

### Setup

```bash
# Clone
git clone https://github.com/HiLleywyn/hodlr.git
cd hodlr

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your tokens and keys

# Generate encryption secret (32 bytes hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Database
npx prisma migrate dev --name init

# Register slash commands
npm run deploy-commands

# Start
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `DISCORD_CLIENT_ID` | Yes | Discord application client ID |
| `DISCORD_GUILD_ID` | No | Restrict commands to one guild (dev mode) |
| `ALCHEMY_API_KEY` | Yes | Alchemy API key |
| `ALCHEMY_WEBHOOK_SIGNING_KEY` | No | For deposit webhook verification |
| `ENCRYPTION_SECRET` | Yes | 32-byte hex string for wallet encryption |
| `DATABASE_URL` | No | Database URL (default: SQLite) |
| `API_PORT` | No | API server port (default: 3000) |
| `DEFAULT_NETWORK` | No | Default network: mainnet or testnet |

## Architecture

```
src/
├── index.ts          # Entry point
├── config.ts         # Environment config
├── bot/              # Discord bot (commands, events, components)
├── core/             # Business logic (wallet, tip, rain, airdrop)
├── blockchain/       # Alchemy SDK + ethers.js + Solana
├── database/         # Prisma ORM + repositories
├── api/              # Fastify REST API + webhooks
└── utils/            # Crypto, formatting, logging
```

### How Tipping Works

1. **Off-chain tips**: Tips between Hodlr users are instant database transfers — no gas, no fees
2. **Deposits**: Users deposit on-chain to their Hodlr wallet address. Detected via Alchemy webhooks
3. **Withdrawals**: Users withdraw to external addresses — signed and broadcast on-chain
4. **Wallets**: HD-derived per chain, encrypted with AES-256-GCM at rest

## Deployment

### Docker

```bash
docker-compose up -d
```

### Railway

1. Connect your repo to [Railway](https://railway.app)
2. Set environment variables in the Railway dashboard
3. Deploy — Railway will use the included `railway.toml` and `Dockerfile`

### Manual

```bash
npm run build
npx prisma migrate deploy
npm start
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/stats` | Bot statistics |
| `POST` | `/webhooks/alchemy` | Alchemy deposit webhooks |

## Security

- Private keys encrypted with **AES-256-GCM** using a server-side secret
- Alchemy webhook signatures verified via HMAC-SHA256
- Per-user rate limiting on all commands
- Ephemeral replies for sensitive data (wallets, balances)
- No private keys ever leave the server

## Development

```bash
# Dev mode with hot reload
npm run dev

# Build
npm run build

# Generate Prisma client after schema changes
npm run db:generate

# Run migrations
npm run db:migrate

# Generate TypeDoc
npm run typedoc
```

## License

Copyright (c) 2026 HiLleywyn. All Rights Reserved.

---

Built with [Discord.js](https://discord.js.org/) | [Alchemy SDK](https://www.alchemy.com/sdk) | [ethers.js](https://docs.ethers.org/) | [Prisma](https://www.prisma.io/) | [Fastify](https://fastify.dev/)
