import { prisma } from "../database/client.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getPrice } from "./price.service.js";
import { formatUsd } from "../utils/format.js";

export interface LeaderboardEntry {
  rank: number;
  discordId: string;
  totalTips: number;
  totalAmount: string;
  totalUsd: number;
}

const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18, WETH: 18,
  POL: 18, MATIC: 18,
  AVAX: 18,
  ARB: 18, OP: 18,
  BNB: 18,
  SOL: 9,
  USDC: 6, USDT: 6,
  DAI: 18, LINK: 18,
};

function rawToHuman(raw: string, symbol: string): number {
  const decimals = TOKEN_DECIMALS[symbol.toUpperCase()] ?? 18;
  return Number(BigInt(raw)) / Math.pow(10, decimals);
}

async function computeUsd(
  txns: Array<{ amount: string; tokenSymbol: string }>,
): Promise<number> {
  const byToken: Record<string, bigint> = {};
  for (const t of txns) {
    const sym = t.tokenSymbol.toUpperCase();
    byToken[sym] = (byToken[sym] ?? 0n) + BigInt(t.amount);
  }
  let total = 0;
  for (const [sym, amt] of Object.entries(byToken)) {
    const info = await getPrice(sym);
    if (info) total += rawToHuman(amt.toString(), sym) * info.price;
  }
  return total;
}

export async function getLeaderboardUSD(
  isTestnet: boolean,
  tokenSymbol: string | null,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const raw = await txRepo.getLeaderboardFull(isTestnet, tokenSymbol, 50);

  const withUsd = await Promise.all(
    raw.map(async (e) => ({ ...e, totalUsd: await computeUsd(e.txns) })),
  );
  withUsd.sort((a, b) => b.totalUsd - a.totalUsd);

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < Math.min(withUsd.length, limit); i++) {
    const user = await prisma.user.findUnique({
      where: { id: withUsd[i].userId },
      select: { discordId: true },
    });
    if (!user) continue;
    entries.push({
      rank: entries.length + 1,
      discordId: user.discordId,
      totalTips: withUsd[i].totalTips,
      totalAmount: formatUsd(withUsd[i].totalUsd),
      totalUsd: withUsd[i].totalUsd,
    });
  }
  return entries;
}

export async function getLeaderboardTips(
  isTestnet: boolean,
  tokenSymbol: string | null,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const raw = await txRepo.getLeaderboardFull(isTestnet, tokenSymbol, limit);

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const user = await prisma.user.findUnique({
      where: { id: raw[i].userId },
      select: { discordId: true },
    });
    if (!user) continue;
    const usd = await computeUsd(raw[i].txns);
    entries.push({
      rank: i + 1,
      discordId: user.discordId,
      totalTips: raw[i].totalTips,
      totalAmount: formatUsd(usd),
      totalUsd: usd,
    });
  }
  return entries;
}

export async function getLeaderboard(
  isTestnet: boolean,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  return getLeaderboardUSD(isTestnet, null, limit);
}

export async function getUserStats(
  discordId: string,
  isTestnet: boolean,
): Promise<{ totalSent: number; totalReceived: number } | null> {
  const user = await prisma.user.findUnique({ where: { discordId }, select: { id: true } });
  if (!user) return null;

  const sent = await prisma.transaction.count({
    where: { senderId: user.id, type: { in: ["tip", "rain", "airdrop"] }, isTestnet, status: "completed" },
  });
  const received = await prisma.transaction.count({
    where: { receiverId: user.id, isTestnet, status: "completed" },
  });
  return { totalSent: sent, totalReceived: received };
}
