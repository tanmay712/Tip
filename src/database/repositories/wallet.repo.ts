import { prisma } from "../client.js";

export async function createWallet(data: {
  userId: string;
  chain: string;
  address: string;
  encryptedKey: string;
  isTestnet: boolean;
}) {
  return prisma.wallet.create({ data });
}

export async function getWallet(
  userId: string,
  chain: string,
  isTestnet: boolean,
) {
  return prisma.wallet.findUnique({
    where: { userId_chain_isTestnet: { userId, chain, isTestnet } },
  });
}

export async function getUserWallets(userId: string, isTestnet: boolean) {
  return prisma.wallet.findMany({
    where: { userId, isTestnet },
  });
}

export async function getWalletsByChain(chainId: string, isTestnet: boolean) {
  return prisma.wallet.findMany({
    where: { chain: chainId, isTestnet },
  });
}

export async function findWalletByAddress(address: string) {
  return prisma.wallet.findFirst({
    // EVM records are stored lowercase; Base58 addresses (Solana/Litecoin) are case-sensitive.
    where: { address: { in: [...new Set([address, address.toLowerCase()])] } },
    include: { user: true },
  });
}
