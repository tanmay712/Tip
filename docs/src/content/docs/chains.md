---
title: Supported Chains
description: All blockchains supported by Hodlr
---

Hodlr supports **8 blockchains** through the [Alchemy](https://www.alchemy.com/) API, each with mainnet and testnet.

## EVM Chains

### Ethereum

| | |
|---|---|
| **Native Token** | ETH |
| **Mainnet** | eth-mainnet |
| **Testnet** | eth-sepolia |
| **Explorer** | [etherscan.io](https://etherscan.io) |
| **Testnet Faucet** | [sepoliafaucet.com](https://sepoliafaucet.com/) |

### Polygon

| | |
|---|---|
| **Native Token** | POL |
| **Mainnet** | polygon-mainnet |
| **Testnet** | polygon-amoy |
| **Explorer** | [polygonscan.com](https://polygonscan.com) |

### Arbitrum

| | |
|---|---|
| **Native Token** | ETH |
| **Mainnet** | arb-mainnet |
| **Testnet** | arb-sepolia |
| **Explorer** | [arbiscan.io](https://arbiscan.io) |

### Optimism

| | |
|---|---|
| **Native Token** | ETH |
| **Mainnet** | opt-mainnet |
| **Testnet** | opt-sepolia |
| **Explorer** | [optimistic.etherscan.io](https://optimistic.etherscan.io) |

### Base

| | |
|---|---|
| **Native Token** | ETH |
| **Mainnet** | base-mainnet |
| **Testnet** | base-sepolia |
| **Explorer** | [basescan.org](https://basescan.org) |

### zkSync

| | |
|---|---|
| **Native Token** | ETH |
| **Mainnet** | zksync-mainnet |
| **Testnet** | zksync-sepolia |
| **Explorer** | [explorer.zksync.io](https://explorer.zksync.io) |

### Avalanche

| | |
|---|---|
| **Native Token** | AVAX |
| **Mainnet** | avax-mainnet |
| **Testnet** | avax-fuji |
| **Explorer** | [snowtrace.io](https://snowtrace.io) |

## Non-EVM Chains

### Solana

| | |
|---|---|
| **Native Token** | SOL |
| **Mainnet** | solana-mainnet |
| **Testnet** | solana-devnet |
| **Explorer** | [solscan.io](https://solscan.io) |
| **Testnet Faucet** | [solfaucet.com](https://solfaucet.com/) |

Solana uses a separate wallet format (Ed25519 keypairs) from EVM chains. Hodlr automatically manages this — each user gets both EVM and Solana wallets.

## Supported Tokens

Each chain supports its **native token** plus popular **ERC-20 tokens** (or SPL tokens on Solana):

- **USDC** — Available on Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche
- **USDT** — Available on Ethereum, Polygon, Arbitrum
- **DAI** — Available on Ethereum
- **LINK** — Available on Ethereum
- **WETH** — Available on Ethereum, Polygon
- **ARB** — Available on Arbitrum
- **OP** — Available on Optimism
- **WAVAX** — Available on Avalanche

Any ERC-20 token can be deposited and withdrawn. The above tokens are pre-configured for easy use with the `/tip` and `/rain` commands.
