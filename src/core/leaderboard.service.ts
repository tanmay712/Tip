import { prisma } from "../database/client.js";
import * as txRepo from "../database/repositories/transaction.repo.js";

export interface LeaderboardEntry {
  rank: number;
  discordId: string;
  totalTips: number;
  totalAmount: string;
}

export async function getLeaderboard(
  isTestnet: boolean,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const raw = await txRepo.getLeaderboard(isTestnet, limit);

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const user = await prisma.user.findUnique({
      where: { id: raw[i].userId },
      select: { discordId: true },
    });
    if (!user) continue;
    entries.push({
      rank: i + 1,
      discordId: user.discordId,
      totalTips: raw[i].totalTips,
      totalAmount: raw[i].totalAmount,
    });
  }

  return entries;
}

export async function getUserStats(
  discordId: string,
  isTestnet: boolean,
): Promise<{
  totalSent: number;
  totalReceived: number;
} | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true },
  });
  if (!user) return null;

  const sent = await prisma.transaction.count({
    where: {
      senderId: user.id,
      type: { in: ["tip", "rain", "airdrop"] },
      isTestnet,
      status: "completed",
    },
  });

  const received = await prisma.transaction.count({
    where: {
      receiverId: user.id,
      isTestnet,
      status: "completed",
    },
  });

  return { totalSent: sent, totalReceived: received };
}
