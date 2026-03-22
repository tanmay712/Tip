---
title: Commands
description: Complete reference for all Hodlr slash commands
---

## Tipping Commands

### `/tip`

Send an instant tip to another Discord user.

| Option | Required | Description |
|--------|----------|-------------|
| `user` | Yes | The user to tip |
| `amount` | Yes | Amount to send |
| `token` | Yes | Token symbol (e.g., ETH, USDC) |
| `chain` | No | Blockchain (defaults to Ethereum) |

```
/tip @alice 0.01 ETH
/tip @bob 5 USDC chain:polygon
```

Tips are **off-chain** — instant with zero gas fees. The recipient receives a DM notification.

---

### `/rain`

Distribute tokens evenly among active server members.

| Option | Required | Description |
|--------|----------|-------------|
| `amount` | Yes | Total amount to distribute |
| `token` | Yes | Token symbol |
| `chain` | No | Blockchain (defaults to Ethereum) |

```
/rain 1 ETH
/rain 100 USDC chain:arbitrum
```

Rain picks up to 50 active members in the server and splits the amount evenly.

---

### `/airdrop`

Create a first-come-first-served claimable airdrop.

| Option | Required | Description |
|--------|----------|-------------|
| `amount` | Yes | Total amount to airdrop |
| `token` | Yes | Token symbol |
| `slots` | Yes | Number of claim slots (1-100) |
| `chain` | No | Blockchain (defaults to Ethereum) |

```
/airdrop 0.5 ETH 10
/airdrop 50 USDC 25 chain:base
```

Creates a message with a **Claim** button. Each user can claim once. Airdrops expire after 1 hour.

---

## Wallet Commands

### `/wallet view`

View all your wallet addresses across every supported chain.

### `/wallet deposit`

Get your deposit address for a specific chain.

| Option | Required | Description |
|--------|----------|-------------|
| `chain` | Yes | The blockchain to deposit to |

```
/wallet deposit chain:ethereum
/wallet deposit chain:solana
```

---

### `/balance`

Check your token balances (on-chain + internal from tips).

| Option | Required | Description |
|--------|----------|-------------|
| `chain` | No | Specific chain (shows all if omitted) |

```
/balance
/balance chain:polygon
```

---

## Info Commands

### `/history`

View your transaction history.

| Option | Required | Description |
|--------|----------|-------------|
| `type` | No | Filter: tip, rain, airdrop, deposit, withdraw |
| `page` | No | Page number |

```
/history
/history type:tip page:2
```

---

### `/leaderboard`

See the top tippers in the community.

| Option | Required | Description |
|--------|----------|-------------|
| `limit` | No | Number of entries (default: 10, max: 25) |

---

### `/price`

Check the current USD price of a token.

| Option | Required | Description |
|--------|----------|-------------|
| `token` | Yes | Token symbol (e.g., ETH, SOL, BTC) |

```
/price ETH
/price SOL
```

---

## Settings Commands

### `/network`

Switch between mainnet and testnet, or view your current network.

| Option | Required | Description |
|--------|----------|-------------|
| `mode` | No | `mainnet` or `testnet` (shows current if omitted) |

```
/network testnet
/network mainnet
/network
```

All commands respect your current network setting.

---

### `/help`

View the command reference or get help for a specific command.

| Option | Required | Description |
|--------|----------|-------------|
| `command` | No | Specific command to get help for |

```
/help
/help command:tip
```
