---
title: Supported Chains
description: All blockchains supported by Crypto
---

Crypto supports nine networks: eight EVM/Solana networks through Alchemy and Litecoin through a hosted BlockCypher-compatible UTXO API. Litecoin mainnet and Testnet3 are supported when the operator configures the provider.

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

Solana uses a separate wallet format (Ed25519 keypairs) from EVM chains. Crypto automatically manages supported wallets; Litecoin wallet addresses are shown only when the operator configures a hosted provider.

### Litecoin

| | |
|---|---|
| **Native Token** | LTC (8 decimals) |
| **Mainnet** | Litecoin mainnet |
| **Testnet** | Testnet3 |
| **Explorer** | [BlockCypher Litecoin explorer](https://live.blockcypher.com/ltc/) |
| **Provider** | Hosted BlockCypher-compatible API; `LITECOIN_API_TOKEN` required |
| **Derivation path** | `m/44'/2'/0'/0/0` (legacy P2PKH) |

Set `LITECOIN_API_BASE_URL` to the provider's HTTPS API root (default `https://api.blockcypher.com/v1/ltc`) and `LITECOIN_API_TOKEN` in the deployment environment. `LITECOIN_CONFIRMATIONS` defaults to 6. The maximum withdrawal miner fee defaults to 1,000,000 litoshi (0.01 LTC) and is configurable with `LITECOIN_MAX_WITHDRAWAL_FEE_SATOSHIS`. The provider must implement BlockCypher-compatible address balance/history, transaction skeleton, and broadcast endpoints. LTC deposits below 0.0001 LTC are ignored.

LTC user balances are internal liabilities backed by a pooled set of Crypto-controlled addresses; `/balance` reports the spendable ledger amount and does not double-count the backing UTXOs. Withdrawals sign inputs from that set, charge the provider's miner fee to the withdrawing user's balance, and are blocked if the provider-reported on-chain reserve is below recorded liabilities. Uncertain broadcast outcomes remain pending and reserved for operator reconciliation. Because UTXO-spend coordination is in-process, operate a single active Crypto instance for a shared Litecoin wallet set. This is custodial; the server retains encrypted signing keys.

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
