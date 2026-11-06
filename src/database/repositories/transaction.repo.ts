import { prisma } from "../client.js";

export async function createTransaction(data: {
  type: string;
  senderId?: string;
  receiverId?: string;
  chain: string;
  token: string;
  tokenSymbol: string;
  amount: string;
  txHash?: string;
  status?: string;
  isTestnet: boolean;
}) {
  return prisma.transaction.create({ data });
}

export async function updateTransactionStatus(id: string, status: string, txHash?: string): Promise<void> {
  await prisma.transaction.update({ where: { id }, data: { status, ...(txHash ? { txHash } : {}) } });
}

export async function findTransactionByTxHash(params: {
  txHash: string;
  type: string;
  chain: string;
  isTestnet: boolean;
  receiverId?: string;
}) {
  return prisma.transaction.findFirst({
    where: {
      txHash: params.txHash,
      type: params.type,
      chain: params.chain,
      isTestnet: params.isTestnet,
      ...(params.receiverId ? { receiverId: params.receiverId } : {}),
    },
    select: { id: true },
  });
}

export async function getUserTransactions(
  userId: string,
  opts: {
    type?: string;
    isTestnet: boolean;
    limit?: number;
    offset?: number;
  },
) {
  const where: Record<string, unknown> = {
    isTestnet: opts.isTestnet,
    OR: [{ senderId: userId }, { receiverId: userId }],
  };
  if (opts.type) where.type = opts.type;

  return prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 10,
    skip: opts.offset ?? 0,
    include: { sender: true, receiver: true },
  });
}

export async function getUserBalance(
  userId: string,
  chain: string,
  token: string,
  isTestnet: boolean,
): Promise<bigint> {
  const receivedTxns = await prisma.transaction.findMany({
    where: { receiverId: userId, chain, token, isTestnet, status: "completed" },
    select: { amount: true },
  });

  const sentTxns = await prisma.transaction.findMany({
    where: { senderId: userId, chain, token, isTestnet, status: { in: ["completed", "pending"] } },
    select: { amount: true },
  });

  let totalReceived = 0n;
  for (const transaction of receivedTxns as Array<{ amount: string }>) {
    totalReceived += BigInt(transaction.amount);
  }
  let totalSent = 0n;
  for (const transaction of sentTxns as Array<{ amount: string }>) {
    totalSent += BigInt(transaction.amount);
  }
  return totalReceived - totalSent;
}

export async function getLeaderboard(
  isTestnet: boolean,
  limit = 10,
): Promise<Array<{ userId: string; totalTips: number; totalAmount: string }>> {
  const results = await prisma.transaction.groupBy({
    by: ["senderId"],
    where: {
      type: { in: ["tip", "rain", "airdrop"] },
      isTestnet,
      senderId: { not: null },
      status: "completed",
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  const entries: Array<{ userId: string; totalTips: number; totalAmount: string }> = [];

  for (const result of results) {
    if (!result.senderId) continue;

    const txns = await prisma.transaction.findMany({
      where: {
        senderId: result.senderId,
        type: { in: ["tip", "rain", "airdrop"] },
        isTestnet,
        status: "completed",
      },
      select: { amount: true },
    });

    const totalAmount = txns.reduce(
      (sum: bigint, t: { amount: string }) => sum + BigInt(t.amount),
      0n,
    );

    entries.push({
      userId: result.senderId,
      totalTips: result._count.id,
      totalAmount: totalAmount.toString(),
    });
  }

  return entries;
}

export async function getTransactionCount(isTestnet: boolean): Promise<number> {
  return prisma.transaction.count({ where: { isTestnet } });
}

/** Full leaderboard data for USD conversion, optionally filtered by token symbol. */
export async function getLeaderboardFull(
  isTestnet: boolean,
  tokenSymbol: string | null,
  limit = 50,
): Promise<Array<{ userId: string; totalTips: number; txns: Array<{ amount: string; tokenSymbol: string }> }>> {
  const baseWhere = {
    type: { in: ["tip", "rain", "airdrop"] as string[] },
    isTestnet,
    senderId: { not: null },
    status: "completed",
    ...(tokenSymbol ? { tokenSymbol: tokenSymbol.toUpperCase() } : {}),
  };

  const grouped = await prisma.transaction.groupBy({
    by: ["senderId"],
    where: baseWhere,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  const entries = [];
  for (const g of grouped) {
    if (!g.senderId) continue;
    const txns = await prisma.transaction.findMany({
      where: { ...baseWhere, senderId: g.senderId },
      select: { amount: true, tokenSymbol: true },
    });
    entries.push({ userId: g.senderId, totalTips: g._count.id, txns });
  }
  return entries;
}
