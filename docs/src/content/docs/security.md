---
title: Security
description: How Hodlr keeps your crypto safe
---

## Wallet Encryption

Every wallet private key is encrypted before being stored in the database.

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key**: Derived from the `ENCRYPTION_SECRET` environment variable (32 bytes hex)
- **IV**: Random 16 bytes generated per encryption operation
- **Storage**: Encrypted keys stored as Base64 strings

Private keys are only decrypted in memory when signing withdrawal transactions, and never logged or exposed via API.

## Wallet Derivation

- **EVM chains**: HD wallet derivation using `ethers.js HDNodeWallet.fromSeed()` with a deterministic seed per user
- **Solana**: Ed25519 keypair from a SHA-512 seed digest
- Each user gets a unique wallet per chain and network (mainnet/testnet)

## Off-Chain Tips

Tips, rain, and airdrops between Hodlr users are **off-chain database transfers**. This means:

- No private keys are used for tipping
- No gas fees
- Instant settlement
- Only withdrawals to external addresses touch the blockchain

## Webhook Verification

Alchemy deposit webhooks are verified using HMAC-SHA256:

1. Alchemy signs the payload with your webhook signing key
2. Hodlr recomputes the HMAC and uses timing-safe comparison
3. Invalid signatures are rejected with 401

## Rate Limiting

All Discord commands are rate-limited to **10 commands per minute per user**. This prevents spam and abuse.

## Ephemeral Responses

Sensitive information is always sent as ephemeral messages (only visible to the requesting user):

- Wallet addresses and deposit info
- Balance information
- Transaction history
- Network settings

## Best Practices

1. **Use a strong `ENCRYPTION_SECRET`**: Generate it cryptographically:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Rotate secrets**: If you suspect your encryption secret is compromised, generate a new one. Note: this will invalidate all existing encrypted keys.

3. **Use PostgreSQL in production**: SQLite is great for development, but PostgreSQL offers better concurrency and backup options.

4. **Set up Alchemy webhooks**: Don't rely solely on polling for deposit detection.

5. **Run behind a reverse proxy**: Use nginx or Cloudflare to handle TLS termination for the webhook endpoint.

6. **Backup your database**: Regular backups ensure you can recover user data.
