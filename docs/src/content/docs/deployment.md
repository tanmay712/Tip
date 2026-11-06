---
title: Deployment
description: Deploy Crypto with Docker, Railway, or manually
---

## Docker

### docker-compose (recommended)

```bash
cp .env.example .env
# Fill in .env

docker-compose up -d
docker-compose logs -f hodlr
```

The compose file mounts a persistent volume at `/app/data` for SQLite and runs health checks on `/health`.

### Dockerfile only

```bash
docker build -t hodlr .
docker run -d \
  --name hodlr \
  --env-file .env \
  -e DATABASE_URL=file:/app/data/hodlr.db \
  -v hodlr-data:/app/data \
  -p 3000:3000 \
  hodlr
```

---

## Railway

1. Push to GitHub and connect to [Railway](https://railway.app)
2. Set environment variables:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `ENCRYPTION_SECRET` — generate: `openssl rand -hex 32`
   - EVM and Solana use public RPC endpoints by default, with no provider login or API key. Override a chain with its `*_RPC_URL` variable if needed.
   - To enable Litecoin, set `LITECOIN_API_TOKEN` and optionally `LITECOIN_API_BASE_URL`; see the Litecoin section in [Supported Chains](/chains/).
3. For persistence: add a Volume mounted at `/app/data` (SQLite), or add the **PostgreSQL** plugin and set `DATABASE_URL`
4. Deploy — Railway uses `railway.toml` and the included `Dockerfile` automatically

### Using PostgreSQL on Railway

1. Add the PostgreSQL plugin
2. Railway injects `DATABASE_URL` automatically
3. Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

4. Run `npx prisma migrate deploy` in a Railway pre-deploy command

---

## Manual

```bash
npm ci
npm run build
npx prisma migrate deploy
npm run deploy-commands
node dist/index.js
```

### PM2

```bash
npm i -g pm2
pm2 start dist/index.js --name hodlr
pm2 save && pm2 startup
```

---

## Deposit Detection

Deposits are detected automatically by polling confirmation-safe blocks through the configured public RPC endpoints. No provider login, API key, or webhook setup is required. EVM block cursors are stored in the database, and standard ERC-20 transfer logs are scanned alongside direct native-coin transfers. Set `EVM_CONFIRMATIONS` and `EVM_BLOCK_SCAN_BATCH_SIZE` to tune scanning; override any public endpoint with its chain-specific `*_RPC_URL` variable.

---

## Verify Deployment

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","uptime":42.0}

curl http://localhost:3000/stats
# {"users":5,"wallets":40,"transactions":{"mainnet":20,"testnet":5,"total":25}}
```
