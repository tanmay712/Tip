import { createCipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import * as userRepo from "../database/repositories/user.repo.js";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import { getPrivateKey } from "./wallet.service.js";

function hashRecoveryKey(key: string, salt: Buffer): Buffer {
  return scryptSync(key, salt, 64);
}

export async function createRecoveryKey(discordId: string): Promise<string> {
  const user = await userRepo.getUser(discordId);
  if (!user) throw new Error("Crypto account not found");
  if (user.recoveryKeyHash) throw new Error("A recovery key already exists. Use the authenticated rotation flow to replace it.");

  const key = randomBytes(32).toString("base64url");
  const salt = randomBytes(16);
  const hash = hashRecoveryKey(key, salt);
  await userRepo.setRecoveryKey(discordId, salt.toString("hex"), hash.toString("hex"));
  return key;
}

export async function verifyRecoveryKey(discordId: string, key: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) return false;
  const user = await userRepo.getUser(discordId);
  if (!user?.recoveryKeyHash || !user.recoveryKeySalt) return false;
  const salt = Buffer.from(user.recoveryKeySalt, "hex");
  const expected = Buffer.from(user.recoveryKeyHash, "hex");
  const actual = hashRecoveryKey(key, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Produce an encrypted export; plaintext wallet keys are never returned over HTTP. */
export async function createEncryptedRecoveryBundle(discordId: string, key: string) {
  if (!(await verifyRecoveryKey(discordId, key))) throw new Error("Recovery key is invalid");
  const user = await userRepo.getUser(discordId);
  if (!user) throw new Error("Crypto account not found");
  const wallets = [
    ...(await walletRepo.getUserWallets(user.id, false)),
    ...(await walletRepo.getUserWallets(user.id, true)),
  ];
  const plaintext = JSON.stringify({
    format: "tipx-recovery-v1",
    createdAt: new Date().toISOString(),
    wallets: wallets.map((wallet: any) => ({
      chain: wallet.chain,
      address: wallet.address,
      isTestnet: wallet.isTestnet,
      privateKey: getPrivateKey(wallet.encryptedKey),
    })),
  });
  const keyBytes = Buffer.from(key, "base64url");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    format: "tipx-encrypted-recovery-v1",
    cipher: "AES-256-GCM",
    createdAt: new Date().toISOString(),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
