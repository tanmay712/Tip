---
title: Getting Started
description: Set up Hodlr in your Discord server
---

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **Discord Bot Token** — [Discord Developer Portal](https://discord.com/developers/applications)
- **Alchemy API Key** — [alchemy.com](https://www.alchemy.com/)

## Installation

```bash
git clone https://github.com/HiLleywyn/hodlr.git
cd hodlr
npm install
```

## Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Your bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Your application's client ID |
| `ALCHEMY_API_KEY` | API key from your Alchemy dashboard |
| `ENCRYPTION_SECRET` | 32-byte hex string for wallet encryption |

Generate an encryption secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database Setup

Hodlr uses Prisma ORM. By default, it uses SQLite for zero-config setup.

```bash
npx prisma migrate dev --name init
```

For production with PostgreSQL, update `DATABASE_URL` in your `.env`:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/hodlr
```

## Register Commands

Register slash commands with Discord:

```bash
npm run deploy-commands
```

For development, set `DISCORD_GUILD_ID` in `.env` to register commands instantly to a specific server instead of waiting for global propagation.

## Start the Bot

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

## Invite the Bot

Use this URL template (replace `CLIENT_ID` with your application's client ID):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=277025770560&scope=bot%20applications.commands
```

Required permissions:
- Send Messages
- Embed Links
- Use Slash Commands
- Read Message History
- Add Reactions

## First Steps

1. Run `/network testnet` to switch to testnet mode
2. Run `/wallet deposit ethereum` to get your deposit address
3. Fund your testnet wallet using a [Sepolia faucet](https://sepoliafaucet.com/)
4. Try `/tip @friend 0.001 ETH` to send your first tip!
