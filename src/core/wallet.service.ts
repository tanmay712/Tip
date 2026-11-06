import { ethers } from "ethers";
import { Keypair } from "@solana/web3.js";
import crypto from "node:crypto";
import { encrypt, decrypt } from "../utils/crypto.js";
import { getChain, CHAIN_IDS } from "../blockchain/chains.js";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as userRepo from "../database/repositories/user.repo.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { deriveLitecoinWallet, isLitecoinConfigured } from "../blockchain/litecoin.js";

function deriveEvmWallet(seed: Buffer): { address: string; privateKey: string } {
  const hdNode = ethers.HDNodeWallet.fromSeed(seed);
  const wallet = hdNode.derivePath("m/44'/60'/0'/0/0");
  return { address: wallet.address, privateKey: wallet.privateKey };
}

function deriveSolanaWallet(seed: Buffer): { address: string; privateKey: string } {
  const keypair = Keypair.fromSeed(seed.subarray(0, 32));
  return {
    address: keypair.publicKey.toBase58(),
    privateKey: Buffer.from(keypair.secretKey).toString("hex"),
  };
}

export async function getOrCreateWallet(
  discordId: string,
  chainId: string,
  isTestnet: boolean,
): Promise<{ address: string; chain: string }> {
  const user = await userRepo.findOrCreateUser(discordId);
  const existing = await walletRepo.getWallet(user.id, chainId, isTestnet);
  if (existing) {
    return { address: existing.address, chain: chainId };
  }

  const chain = getChain(chainId);
  if (chain.type === "litecoin" && !isLitecoinConfigured()) {
    throw new Error("Litecoin wallets are disabled until the operator configures a hosted provider");
  }
  // The database user ID is public/guessable; deriving from it alone would let anyone
  // recreate every wallet. Key derivation is now bound to the server's high-entropy secret.
  const seed = crypto.createHmac("sha512", Buffer.from(config.encryption.secret, "hex"))
    .update(`${user.id}:${chainId}:${isTestnet}`)
    .digest();

  let address: string;
  let privateKey: string;

  if (chain.type === "solana") {
    const result = deriveSolanaWallet(seed);
    address = result.address;
    privateKey = result.privateKey;
  } else if (chain.type === "litecoin") {
    const result = deriveLitecoinWallet(seed, isTestnet);
    address = result.address;
    privateKey = result.privateKey;
  } else {
    const result = deriveEvmWallet(seed);
    address = result.address;
    privateKey = result.privateKey;
  }

  const encryptedKey = encrypt(privateKey);
  await walletRepo.createWallet({
    userId: user.id,
    chain: chainId,
    address: chain.type === "evm" ? address.toLowerCase() : address,
    encryptedKey,
    isTestnet,
  });

  logger.info({ discordId, chain: chainId, isTestnet }, "Wallet created");
  return { address, chain: chainId };
}

export async function getAllWallets(discordId: string, isTestnet: boolean) {
  const user = await userRepo.findOrCreateUser(discordId);
  const wallets = await walletRepo.getUserWallets(user.id, isTestnet);

  const existingChains = new Set(wallets.map((w: { chain: string }) => w.chain));
  for (const chainId of CHAIN_IDS) {
    if (chainId === "litecoin" && !isLitecoinConfigured()) continue;
    if (!existingChains.has(chainId)) {
      await getOrCreateWallet(discordId, chainId, isTestnet);
    }
  }

  const allWallets = await walletRepo.getUserWallets(user.id, isTestnet);
  return isLitecoinConfigured() ? allWallets : allWallets.filter((wallet: { chain: string }) => wallet.chain !== "litecoin");
}

export function getPrivateKey(encryptedKey: string): string {
  return decrypt(encryptedKey);
}

export async function getWalletForChain(
  discordId: string,
  chainId: string,
  isTestnet: boolean,
) {
  const user = await userRepo.getUser(discordId);
  if (!user) return null;
  return walletRepo.getWallet(user.id, chainId, isTestnet);
}
