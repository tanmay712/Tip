---
title: Getting Started
description: Set up Crypto in your Discord server
---

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **Discord Bot Token** — [Discord Developer Portal](https://discord.com/developers/applications)
- Public EVM/Solana RPC endpoints are configured by default; no blockchain-provider account or API key is required.

## Installation

```bash
git clone https://github.com/tanmay712/Tip.git
cd Tip
npm install
cp .env.example .env
```

## Configuration

Fill in `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | Application Client ID |
| `*_RPC_URL` | No | Public RPC defaults | Optional per-chain override if a default endpoint is rate-limited |
| `ENCRYPTION_SECRET` | Yes | 32-byte hex for wallet encryption |

Generate `ENCRYPTION_SECRET`:

```bash
openssl rand -hex 32
```

## Database

```bash
npx prisma db push
```

For PostgreSQL, set `DATABASE_URL` to your connection string and update `prisma/schema.prisma` to use `provider = "postgresql"`.

## Register Slash Commands

```bash
npm run deploy-commands
```

Set `DISCORD_GUILD_ID` in `.env` during development to register commands instantly to one server instead of waiting for global propagation (~1 hour).

## Start

```bash
npm run dev    # development, hot reload
npm run build && npm start  # production
```

## Invite the Bot

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=277025770560&scope=bot%20applications.commands
```

Required permissions: Send Messages, Embed Links, Use Slash Commands, Read Message History.

## First Steps

1. Switch to testnet: `/network testnet` or `$network testnet`
2. Get a deposit address: `/wallet deposit chain:ethereum`
3. Fund it from a [Sepolia faucet](https://sepoliafaucet.com/)
4. Wait up to 60 seconds for the deposit poller to pick it up
5. Check your balance: `/balance chain:ethereum`
6. Send a tip: `/tip @friend 0.001 ETH`
