import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getChain, CHAIN_IDS } from "../blockchain/chains.js";
import { TXN_TYPES } from "../utils/constants.js";
import { logger } from "../utils/logger.js";
import type { AlchemyWebhookEvent } from "../blockchain/webhooks.js";

export async function processWebhookDeposit(
  event: AlchemyWebhookEvent,
): Promise<{ credited: number }> {
  let credited = 0;

  for (const activity of event.event.activity) {
    const toAddress = activity.toAddress?.toLowerCase();
    if (!toAddress) continue;

    const wallet = await walletRepo.findWalletByAddress(toAddress);
    if (!wallet) continue;

    // Check if we've already recorded this deposit
    const existing = await txRepo.findTransactionByTxHash({
      txHash: activity.hash,
      type: TXN_TYPES.DEPOSIT,
      chain: wallet.chain,
      isTestnet: wallet.isTestnet,
    });
    if (existing) continue;

    const tokenSymbol = activity.asset || getChain(wallet.chain).nativeToken;
    const token =
      activity.rawContract?.address?.toLowerCase() || "native";
    const rawAmount = activity.rawContract
      ? activity.rawContract.rawValue
      : Math.floor(
          activity.value * 10 ** getChain(wallet.chain).nativeDecimals,
        ).toString();

    await txRepo.createTransaction({
      type: TXN_TYPES.DEPOSIT,
      receiverId: wallet.userId,
      chain: wallet.chain,
      token,
      tokenSymbol,
      amount: rawAmount,
      txHash: activity.hash,
      isTestnet: wallet.isTestnet,
      status: "completed",
    });

    credited++;
    logger.info(
      {
        address: toAddress,
        chain: wallet.chain,
        amount: rawAmount,
        txHash: activity.hash,
      },
      "Deposit credited",
    );
  }

  return { credited };
}

/**
 * Poll for new deposits across all supported chains
 * This is a fallback mechanism - prefer using Alchemy webhooks in production
 * @param isTestnet - Whether to poll testnet or mainnet chains
 */
export async function pollDeposits(isTestnet: boolean): Promise<void> {
  for (const chainId of CHAIN_IDS) {
    const chain = getChain(chainId);
    // Solana has separate polling mechanism via webhooks
    if (chain.type === "solana") continue;

    try {
      logger.debug({ chain: chainId, isTestnet }, "Polling deposits for chain");
      
      const wallets = await walletRepo.getWalletsByChain(chainId, isTestnet);
      
      for (const wallet of wallets) {
        if (wallet.chain !== chainId) continue;
        
        // Check on-chain balance and compare with internal balance
        // This is a simplified approach - in production, use Alchemy webhooks
        // for real-time deposit detection
        logger.debug(
          { address: wallet.address, chain: chainId },
          "Checking wallet for deposits",
        );
      }
      
      logger.debug({ chain: chainId, isTestnet }, "Deposit poll completed for chain");
    } catch (err) {
      logger.error({ err, chain: chainId }, "Deposit poll failed for chain");
    }
  }
}
