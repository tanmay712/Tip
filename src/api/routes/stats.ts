import type { FastifyInstance } from "fastify";
import { prisma } from "../../database/client.js";
import { getTransactionCount } from "../../database/repositories/transaction.repo.js";

export function registerStatsRoutes(app: FastifyInstance): void {
  app.get("/stats", async () => {
    const [userCount, mainnetTxns, testnetTxns, walletCount] =
      await Promise.all([
        prisma.user.count(),
        getTransactionCount(false),
        getTransactionCount(true),
        prisma.wallet.count(),
      ]);

    return {
      users: userCount,
      wallets: walletCount,
      transactions: {
        mainnet: mainnetTxns,
        testnet: testnetTxns,
        total: mainnetTxns + testnetTxns,
      },
    };
  });
}
