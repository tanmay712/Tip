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

export async function getUserNetwork(
  discordId: string,
): Promise<"mainnet" | "testnet"> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { network: true },
  });
  return (user?.network as "mainnet" | "testnet") ?? config.defaultNetwork;
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
