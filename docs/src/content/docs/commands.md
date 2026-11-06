---
title: Commands
description: Complete reference for all Crypto slash and prefix commands
---

All commands are available as Discord slash commands (`/command`) and prefix commands (`$command`).

## Tipping

### `/tip` · `$tip @user <amount> <token> [chain]`

Send an instant off-chain tip to another user.

| Option | Required | Description |
|--------|----------|-------------|
| `user` | Yes | The user to tip |
| `amount` | Yes | Amount to send |
| `token` | Yes | Token symbol (e.g. ETH, USDC) |
| `chain` | No | Blockchain — defaults to Ethereum |

```
/tip @alice 0.01 ETH
$tip @alice 0.01 ETH polygon
```

Tips are instant and gas-free. The recipient gets a DM notification.

---

### `/rain` · `$rain <amount> <token> [chain]`

Distribute tokens evenly among active server members.

| Option | Required | Description |
|--------|----------|-------------|
| `amount` | Yes | Total amount to distribute |
| `token` | Yes | Token symbol |
| `chain` | No | Blockchain — defaults to Ethereum |

```
/rain 1 ETH
$rain 100 USDC arbitrum
```

Splits the amount across up to 50 members.

---

### `/airdrop` · slash only

Create a first-come-first-served claimable airdrop with a Claim button.

| Option | Required | Description |
|--------|----------|-------------|
| `amount` | Yes | Total amount |
| `token` | Yes | Token symbol |
| `slots` | Yes | Number of claim slots (1–100) |
| `chain` | No | Blockchain — defaults to Ethereum |

```
/airdrop 0.5 ETH 10
/airdrop 50 USDC 25 chain:base
```

Each user can claim once. Expires after 1 hour.

---

## Wallet

### `/wallet view` · `$wallet`

View all your wallet addresses across every chain.

### `/wallet deposit` · `$wallet deposit <chain>`

Get your deposit address for a specific chain. Deposits are detected automatically by the polling system — no webhook setup needed.

```
/wallet deposit chain:ethereum
$wallet deposit solana
```

### `/wallet withdraw` · `$withdraw <chain> <address> <amount> <token>`

Withdraw tokens to an external wallet address. The transaction is signed and broadcast on-chain.

```
/wallet withdraw chain:ethereum address:0x... amount:0.01 token:ETH
$withdraw ethereum 0x... 0.01 ETH
```

---

## Balance

### `/balance` · `$balance [chain]`

Check your balances. Without a chain, shows internal (tip/rain) balances across all chains. Specify a chain for a full on-chain view including ERC20 tokens.

```
/balance
/balance chain:ethereum
$balance ethereum
```

---

## Info

### `/history` · slash only

View your transaction history with optional filters.

| Option | Required | Description |
|--------|----------|-------------|
| `type` | No | Filter: tip, rain, airdrop, deposit, withdraw |
| `page` | No | Page number |

### `/leaderboard` · `$leaderboard [limit]`

Top tippers ranked by total tips sent. Limit defaults to 10, max 25.

### `/price` · `$price <token>`

Live USD price and 24h change. Supported: ETH, SOL, AVAX, POL, ARB, OP, USDC, USDT, DAI, LINK, WETH, BTC.

---

## Account, security, and audit

- `/account status|dashboard|privacy` reviews your account and opens the authenticated recovery dashboard.
- `/security status|dashboard|backup-guide|privacy` covers consent, recovery, and security guidance.
- `/transactions recent|lookup|summary|deposits|withdrawals|tips` only shows transactions associated with your own account.
- `/assets list|lookup|native-prices` lists configured chains/tokens and price data.
- `/settings status|notifications-on|notifications-off|mainnet|testnet` controls personal preferences.

The dashboard uses Discord OAuth `identify` only. Recovery keys are shown once and backups are AES-GCM encrypted. Crypto never sends raw private keys in Discord messages. Keep the recovery key and encrypted backup separately.

## Server and owner controls

- `/server status|log-channel-set|log-channel-clear|admin-role-set` requires Discord's **Manage Server** permission.
- `/owner stats|user-lookup|user-ban|user-unban` is limited to IDs in `OWNER_DISCORD_IDS`.

## Settings

### `/network` · `$network [mainnet|testnet]`

View or switch your network. All commands respect your network setting. Omit the mode to see what you're currently on.

```
/network testnet
$network mainnet
$network
```

### `/help` · `$help [command]`

Command reference. Pass a command name for detailed usage.

```
/help command:tip
$help withdraw
```
