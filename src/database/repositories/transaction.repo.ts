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

export async function findTransactionByTxHash(params: {
  txHash: string;
  type: string;
  chain: string;
  isTestnet: boolean;
}) {
  return prisma.transaction.findFirst({
    where: {
      txHash: params.txHash,
      type: params.type,
      chain: params.chain,
      isTestnet: params.isTestnet,
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
    where: { senderId: userId, chain, token, isTestnet, status: "completed" },
    select: { amount: true },
  });

  const totalReceived = receivedTxns.reduce(
    (sum: bigint, t: { amount: string }) => sum + BigInt(t.amount),
    0n,
  );
  const totalSent = sentTxns.reduce(
    (sum: bigint, t: { amount: string }) => sum + BigInt(t.amount),
    0n,
  );
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
