import { prisma } from "../client.js";

export async function createAirdrop(data: {
  creatorId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  chain: string;
  token: string;
  tokenSymbol: string;
  totalAmount: string;
  perClaim: string;
  maxClaims: number;
  expiresAt: Date;
}) {
  return prisma.airdrop.create({ data });
}

export async function getAirdrop(id: string) {
  return prisma.airdrop.findUnique({
    where: { id },
    include: { claims: true },
  });
}

export async function claimAirdrop(airdropId: string, userId: string) {
  return prisma.airdropClaim.create({
    data: { airdropId, userId },
  });
}

export async function hasClaimedAirdrop(
  airdropId: string,
  userId: string,
): Promise<boolean> {
  const claim = await prisma.airdropClaim.findUnique({
    where: { airdropId_userId: { airdropId, userId } },
  });
  return !!claim;
}

export async function getAirdropClaimCount(airdropId: string): Promise<number> {
  return prisma.airdropClaim.count({ where: { airdropId } });
}

export async function updateAirdropMessage(id: string, messageId: string) {
  return prisma.airdrop.update({
    where: { id },
    data: { messageId },
  });
}
