# Crypto

> Crypto tips. Across chains.

A Discord crypto tipping bot powered by [Alchemy](https://www.alchemy.com/) for EVM/Solana networks and a hosted BlockCypher-compatible API for Litecoin. Send tips, rain tokens, create airdrops, deposit, and withdraw across **nine networks** with mainnet and testnet support.

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
| Account | `/account` | — | Consent, dashboard, recovery status |
| Security | `/security` | — | Recovery and privacy guidance |
| Transactions | `/transactions` | — | Recent, categorized, and hash lookup |
| Assets | `/assets` | — | Supported token contracts and prices |
| Settings | `/settings` | — | Network default and optional DMs |
| Server | `/server` | — | Audit log and admin-role configuration |
| Owner | `/owner` | — | Owner allowlist-only operations |

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
| Litecoin | ✅ | Testnet3 | LTC |

Litecoin uses a hosted BlockCypher-compatible UTXO API. Configure `LITECOIN_API_TOKEN` (and optionally `LITECOIN_API_BASE_URL`) before LTC deposits and on-chain withdrawals are enabled. `/balance` reports the spendable Crypto ledger balance; pooled on-chain reserves are not added a second time. Deposits require `LITECOIN_CONFIRMATIONS` (default 6). Withdrawal miner fees are charged to the user's LTC balance and capped at 0.01 LTC by default (`LITECOIN_MAX_WITHDRAWAL_FEE_SATOSHIS`); withdrawals pause if pooled on-chain reserves do not cover recorded user balances. Run only one active Crypto instance per shared Litecoin wallet set, because distributed UTXO-spend coordination is not implemented.

## Discord UI and emoji assets

Slash, button, and prefix-command responses use Discord Components V2 containers. Existing embeds are rendered as readable text blocks inside the V2 layout. The bot keeps Unicode fallback icons and can replace them with application emojis you upload: add artwork to `emojis/` and run `npm run emojis:upload`. Filenames map to emoji keys (for example, `tip.png` replaces the tip icon); the generated ID mapping is used after the next build/restart. See [`emojis/README.md`](emojis/README.md).

## Account consent, dashboard, and recovery

The Fastify dashboard starts automatically with the bot and serves `/`, `/privacy`, `/terms`, `/auth/discord`, `/account`, and `/recover` on the configured API port. Set `APP_BASE_URL` to the public HTTPS origin and register `${APP_BASE_URL}/auth/discord/callback` as the Discord OAuth2 redirect URI. OAuth requests only the `identify` scope; it does not request guild, email, or message permissions. Configure `DISCORD_CLIENT_SECRET` and `OWNER_DISCORD_IDS` in the deployment environment.

New users must explicitly accept the current Terms and Privacy Policy before commands run; declining blocks command execution. After acceptance, Crypto sends a dashboard sign-in link by DM. The authenticated dashboard can issue a random 256-bit recovery key once and export an AES-GCM encrypted wallet backup. The key and backup are both required for the **user's offline export**; they should be stored separately. `/recover` decrypts the backup locally in the browser and `/recover-tool.html` downloads a standalone HTML decryptor for offline use; neither sends the recovery key or decrypted data to the server. This is still a **custodial** bot: Crypto retains encrypted signing keys to execute bot transactions, so the recovery key does not remove operator custody. Never share the key or backup with support.

The included Terms and Privacy Policy are **draft templates**, not legal advice. Have qualified counsel review and replace them with operator-specific policies before accepting real funds; consent remains disabled until `LEGAL_DOCUMENTS_APPROVED=true`. Database schema changes require `npm run db:push` (the Docker/Railway startup already applies Prisma schema changes).

## Network coverage and deposits

Crypto supports eight EVM/Solana networks through Alchemy and Litecoin through a separate BlockCypher-compatible UTXO provider. EVM deposits are polled every 60 seconds using Alchemy's `getAssetTransfers`; Litecoin deposit history is polled through the configured hosted provider and credited only after the configured confirmation count. Litecoin deposits under 0.0001 LTC are ignored. EVM Alchemy webhooks remain available (`ALCHEMY_WEBHOOK_SIGNING_KEY` + POST `/webhooks/alchemy`).

Litecoin keys use BIP44 coin type 2 and are held encrypted by the server, consistent with Crypto's custodial design. LTC balances are pooled internally: transactions are signed from the bot-controlled Litecoin wallet set, and a reserve check blocks withdrawals if on-chain funds are below recorded user liabilities. Uncertain provider broadcast results stay reserved as pending for operator reconciliation rather than risking a duplicate spend. Do not run multiple active bot instances against the same Litecoin wallets; this release has no distributed UTXO-spend lock.

## Quick Start

```bash
git clone https://github.com/tanmay712/Tip.git
cd Tip
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
| `DISCORD_CLIENT_SECRET` | For OAuth | — | Discord OAuth2 client secret for the identify-only dashboard login |
| `APP_BASE_URL` | For OAuth | — | Public HTTPS origin, no trailing slash; configure the matching Discord callback URL |
| `OWNER_DISCORD_IDS` | No | — | Comma-separated Discord IDs authorized for `/owner` commands |
| `TERMS_VERSION` | No | `2026-11` | Version of consent recorded for new/updated legal terms |
| `LEGAL_DOCUMENTS_APPROVED` | Before consent | `false` | Operator attestation: set true only after replacing/reviewing the draft policy and terms |
| `DISCORD_GUILD_ID` | No | — | Dev mode: restrict command registration to one guild |
| `ALCHEMY_API_KEY` | Yes | — | Alchemy API key |
| `ALCHEMY_WEBHOOK_SIGNING_KEY` | No | — | Optional: verify incoming Alchemy webhooks |
| `LITECOIN_API_BASE_URL` | For LTC | `https://api.blockcypher.com/v1/ltc` | HTTPS BlockCypher-compatible provider API root |
| `LITECOIN_API_TOKEN` | For LTC | — | Provider token; LTC deposits and on-chain withdrawals remain disabled without it |
| `LITECOIN_CONFIRMATIONS` | No | `6` | LTC confirmations required before crediting deposits (1–100) |
| `LITECOIN_MAX_WITHDRAWAL_FEE_SATOSHIS` | No | `1000000` | Max LTC withdrawal miner fee, in litoshi (satoshis) |
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
│   ├── commands/         # 17 slash-command groups (~41 useful actions)
│   ├── prefix/           # Prefix command router ($)
│   ├── events/           # Discord events
│   └── components/       # Components V2 adapter, embeds, buttons, pagination
├── core/                 # Business logic — tip, rain, airdrop, withdraw, deposit
├── blockchain/           # Alchemy SDK, ethers.js, Solana, Litecoin UTXO provider
├── database/             # Prisma client + repositories
├── api/                  # Fastify — health, stats, Alchemy webhooks
└── utils/                # Crypto, format, logging, custom emoji map, constants
emojis/                    # Upload artwork here via npm run emojis:upload
scripts/upload-emojis.ts   # Sync application emojis to Discord
```

## Deployment

### Docker

```bash
docker-compose up -d
```

### Railway

1. Connect the repository to [Railway](https://railway.app)
2. Set environment variables in the Railway dashboard
3. Add a volume mounted at `/app/data` (for SQLite persistence), or add the Postgres plugin
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
- Raw keys are never sent through Discord; the dashboard only exports an AES-GCM encrypted archive for the user's offline recovery

## Development

```bash
npm run dev             # Hot-reload dev server
npm run build           # TypeScript compile
npm run deploy-commands # Register slash commands
npm run emojis:upload   # Upload/update images from ./emojis
npm run db:migrate      # Run Prisma migrations
npm run db:generate     # Regenerate Prisma client
npm run format          # Prettier
npm run lint            # ESLint
```

## License

Copyright (c) 2026 HiLleywyn. All Rights Reserved.

---

Built with [Discord.js](https://discord.js.org/) · [Alchemy SDK](https://www.alchemy.com/sdk) · [ethers.js](https://docs.ethers.org/) · [Prisma](https://www.prisma.io/) · [Fastify](https://fastify.dev/)
