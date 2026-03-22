---
title: Deployment
description: Deploy Hodlr with Docker, Railway, or manually
---

## Docker

The fastest way to deploy Hodlr in production.

### docker-compose (recommended)

```bash
# Create .env file
cp .env.example .env
# Edit .env with your values

# Start
docker-compose up -d

# View logs
docker-compose logs -f hodlr

# Stop
docker-compose down
```

The compose file includes:
- Persistent SQLite storage via Docker volume
- Health checks on `/health`
- Auto-restart on failure

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

## Railway

1. Push your code to GitHub
2. Connect the repo to [Railway](https://railway.app)
3. Add environment variables in the Railway dashboard:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `ALCHEMY_API_KEY`
   - `ENCRYPTION_SECRET`
   - `DATABASE_URL` (Railway provides PostgreSQL add-on)
4. Deploy — Railway auto-detects the `railway.toml` config

The included `railway.toml` runs migrations before starting:

```toml
[deploy]
startCommand = "npx prisma migrate deploy && node dist/index.js"
healthcheckPath = "/health"
```

### Railway with PostgreSQL

1. Add a PostgreSQL plugin in Railway
2. Copy the `DATABASE_URL` from the plugin to your service variables
3. Update the Prisma schema provider if needed:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## Manual Deployment

```bash
# Install dependencies
npm ci

# Build TypeScript
npm run build

# Run database migrations
npx prisma migrate deploy

# Register Discord commands (one-time)
npm run deploy-commands

# Start
node dist/index.js
```

### Process Manager (PM2)

```bash
npm install -g pm2
pm2 start dist/index.js --name hodlr
pm2 save
pm2 startup
```

## Setting Up Alchemy Webhooks

For automatic deposit detection:

1. Go to [Alchemy Dashboard](https://dashboard.alchemy.com/) → Webhooks
2. Create a new **Address Activity** webhook
3. Set the webhook URL to: `https://your-domain.com/webhooks/alchemy`
4. Add the Hodlr wallet addresses you want to monitor
5. Copy the **Signing Key** and set it as `ALCHEMY_WEBHOOK_SIGNING_KEY` in your `.env`

Without webhooks, deposits can still be detected but will require manual checking.

## Health Check

Verify your deployment:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","uptime":123.45}

curl http://localhost:3000/stats
# {"users":42,"wallets":336,"transactions":{"mainnet":100,"testnet":50,"total":150}}
```
