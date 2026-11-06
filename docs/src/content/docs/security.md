---
title: Security
description: How Crypto keeps your crypto safe
---

## Wallet Encryption

Every wallet private key is encrypted before being stored in the database.

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key**: Derived from the `ENCRYPTION_SECRET` environment variable (32 bytes hex)
- **IV**: Random 16 bytes generated per encryption operation
- **Storage**: Encrypted keys stored as Base64 strings

Private keys are only decrypted in memory for signing and encrypted-backup generation; they are never logged or returned in plaintext by an API.

## Wallet Derivation and Custody

- **EVM chains**: HD wallet derivation using `ethers.js HDNodeWallet.fromSeed()` from an HMAC-SHA512 seed keyed with `ENCRYPTION_SECRET`
- **Solana**: Ed25519 keypair from a keyed seed digest
- Each user gets a unique wallet per chain and network (mainnet/testnet)
- Crypto is custodial: the server can decrypt stored keys to sign bot withdrawals. The recovery key enables the user's encrypted offline export; it does not remove server custody.
- Raw private-key export via Discord has been disabled. The legacy `$privatekey` command redirects to the authenticated recovery dashboard.

## Consent and recovery

New and returning users must accept the configured current Privacy Policy and Terms before commands execute. The operator must publish reviewed legal documents and set `LEGAL_DOCUMENTS_APPROVED=true`; drafts are deliberately not enough to enable consent.

The dashboard uses Discord OAuth `identify` only. It does not request guild, email, or message permissions, and the OAuth bearer token is discarded after identity lookup. A random recovery key is shown once; only its scrypt verification hash is stored. A user who supplies that key can download an AES-256-GCM encrypted backup. `/recover-tool.html` is a standalone local decryptor; the key and plaintext backup are not sent back to Crypto by that tool. Keep the key and backup separately. If the recovery key is lost, Crypto cannot reveal it again; the service itself remains custodial.

## Off-Chain Tips

Tips, rain, and airdrops between Crypto users are **off-chain database transfers**. This means:

- No private keys are used for tipping
- No gas fees
- Instant settlement
- Only withdrawals to external addresses touch the blockchain

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

2. **Protect and back up `ENCRYPTION_SECRET`**: Never rotate it casually. Existing encrypted keys require the original secret, and new wallet derivations are bound to it. Rotate only with a reviewed migration that re-encrypts every wallet and verifies recovery first.

3. **Use PostgreSQL in production**: SQLite is great for development, but PostgreSQL offers better concurrency and backup options.

4. **Use trusted RPC endpoints**: Public endpoints need no account, but may rate-limit or be unavailable. Configure chain-specific RPC URLs for reliability, and test deposit scanning before enabling real funds.

5. **Run behind a reverse proxy**: Use nginx or Cloudflare to handle TLS termination for the webhook endpoint.

6. **Backup your database**: Regular backups ensure you can recover user data.
