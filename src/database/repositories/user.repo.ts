import { prisma } from "../client.js";
import { config } from "../../config.js";

export async function findOrCreateUser(discordId: string) {
  return prisma.user.upsert({
    where: { discordId },
    update: {},
    create: { discordId, network: config.defaultNetwork },
    include: { wallets: true },
  });
}

export async function getUser(discordId: string) {
  return prisma.user.findUnique({
    where: { discordId },
    include: { wallets: true },
  });
}

export async function setUserNetwork(
  discordId: string,
  network: "mainnet" | "testnet",
) {
  return prisma.user.update({
    where: { discordId },
    data: { network },
  });
}

export async function acceptCurrentTerms(discordId: string) {
  const now = new Date();
  return prisma.user.update({
    where: { discordId },
    data: {
      privacyAcceptedAt: now,
      termsAcceptedAt: now,
      consentDeclinedAt: null,
      termsVersion: config.dashboard.termsVersion,
    },
  });
}

export async function declineCurrentTerms(discordId: string) {
  return prisma.user.update({
    where: { discordId },
    data: { consentDeclinedAt: new Date() },
  });
}

export async function hasCurrentConsent(discordId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { privacyAcceptedAt: true, termsAcceptedAt: true, termsVersion: true },
  });
  return !!user?.privacyAcceptedAt && !!user.termsAcceptedAt && user.termsVersion === config.dashboard.termsVersion;
}

export async function getUserNetwork(
  discordId: string,
): Promise<"mainnet" | "testnet"> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { network: true },
  });
  return (user?.network as "mainnet" | "testnet") ?? config.defaultNetwork;
}

export async function setRecoveryKey(discordId: string, salt: string, hash: string): Promise<void> {
  const result = await prisma.user.updateMany({
    where: { discordId, recoveryKeyHash: null },
    data: { recoveryKeySalt: salt, recoveryKeyHash: hash },
  });
  if (result.count !== 1) throw new Error("A recovery key is already set");
}

export async function setDmEnabled(discordId: string, enabled: boolean): Promise<void> {
  await prisma.user.upsert({
    where: { discordId },
    update: { dmEnabled: enabled },
    create: { discordId, network: config.defaultNetwork, dmEnabled: enabled },
  });
}

export async function isDmEnabled(discordId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { dmEnabled: true },
  });
  return user?.dmEnabled ?? false;
}
