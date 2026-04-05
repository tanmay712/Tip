import { PublicKey } from "@solana/web3.js";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getChain, CHAIN_IDS } from "../blockchain/chains.js";
import { getAlchemy } from "../blockchain/alchemy.js";
import { getSolanaConnection } from "../blockchain/solana.js";
import { TXN_TYPES, LIMITS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";
import type { AlchemyWebhookEvent } from "../blockchain/webhooks.js";

const lastProcessedBlock = new Map<string, string>();

export async function processWebhookDeposit(
  event: AlchemyWebhookEvent,
): Promise<{ credited: number }> {
  let credited = 0;

  for (const activity of event.event.activity) {
    const toAddress = activity.toAddress?.toLowerCase();
    if (!toAddress) continue;

    const wallet = await walletRepo.findWalletByAddress(toAddress);
    if (!wallet) continue;

    const existing = await txRepo.findTransactionByTxHash({
      txHash: activity.hash,
      type: TXN_TYPES.DEPOSIT,
      chain: wallet.chain,
      isTestnet: wallet.isTestnet,
    });
    if (existing) continue;

    const tokenSymbol = activity.asset || getChain(wallet.chain).nativeToken;
    const token = activity.rawContract?.address?.toLowerCase() || "native";
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
      { address: toAddress, chain: wallet.chain, txHash: activity.hash },
      "Deposit credited via webhook",
    );
  }

  return { credited };
}

async function pollEvmChain(chainId: string, isTestnet: boolean): Promise<void> {
  const wallets = await walletRepo.getWalletsByChain(chainId, isTestnet);
  if (wallets.length === 0) return;

  const alchemy = getAlchemy(chainId, isTestnet);
  const key = `${chainId}:${isTestnet}`;

  let fromBlock = lastProcessedBlock.get(key);
  if (!fromBlock) {
    const current = await alchemy.core.getBlockNumber();
    fromBlock = "0x" + Math.max(0, current - 1000).toString(16);
  }

  const currentBlockNum = await alchemy.core.getBlockNumber();
  const toBlock = "0x" + currentBlockNum.toString(16);

  if (fromBlock === toBlock) return;

  const chain = getChain(chainId);

  for (const wallet of wallets) {
    try {
      const result = await alchemy.core.getAssetTransfers({
        fromBlock,
        toBlock,
        toAddress: wallet.address,
        excludeZeroValue: true,
        category: ["external", "erc20"] as never,
        maxCount: 100,
        order: "desc" as never,
      } as never);

      for (const transfer of (result as unknown as { transfers: Record<string, unknown>[] }).transfers) {
        const hash = transfer.hash as string;
        if (!hash) continue;

        const existing = await txRepo.findTransactionByTxHash({
          txHash: hash,
          type: TXN_TYPES.DEPOSIT,
          chain: chainId,
          isTestnet,
        });
        if (existing) continue;

        const rawContractAddress = (transfer.rawContract as Record<string, string> | null)?.address?.toLowerCase() || null;
        const rawContractValue = (transfer.rawContract as Record<string, string> | null)?.value || null;
        const floatValue = transfer.value as number | null;

        const token = rawContractAddress || "native";
        const tokenSymbol = (transfer.asset as string) || chain.nativeToken;

        let rawAmount: string;
        if (rawContractValue) {
          rawAmount = BigInt(rawContractValue).toString();
        } else if (floatValue != null) {
          rawAmount = BigInt(Math.round(floatValue * 10 ** chain.nativeDecimals)).toString();
        } else {
          continue;
        }

        if (BigInt(rawAmount) <= 0n) continue;

        await txRepo.createTransaction({
          type: TXN_TYPES.DEPOSIT,
          receiverId: wallet.userId,
          chain: chainId,
          token,
          tokenSymbol,
          amount: rawAmount,
          txHash: hash,
          isTestnet,
          status: "completed",
        });

        logger.info(
          { address: wallet.address, chain: chainId, txHash: hash, amount: rawAmount },
          "Deposit credited via polling",
        );
      }
    } catch (err) {
      logger.error({ err, chain: chainId, address: wallet.address }, "EVM deposit poll failed for wallet");
    }
  }

  lastProcessedBlock.set(key, toBlock);
}

async function pollSolanaChain(isTestnet: boolean): Promise<void> {
  const wallets = await walletRepo.getWalletsByChain("solana", isTestnet);
  if (wallets.length === 0) return;

  const conn = getSolanaConnection(isTestnet);

  for (const wallet of wallets) {
    try {
      const pubkey = new PublicKey(wallet.address);
      const sigs = await conn.getSignaturesForAddress(pubkey, { limit: 20 });

      for (const sig of sigs) {
        if (sig.err) continue;

        const existing = await txRepo.findTransactionByTxHash({
          txHash: sig.signature,
          type: TXN_TYPES.DEPOSIT,
          chain: "solana",
          isTestnet,
        });
        if (existing) continue;

        const tx = await conn.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx?.meta) continue;

        const accountKeys = tx.transaction.message.accountKeys;
        const walletIndex = accountKeys.findIndex(
          (k) => k.pubkey.toBase58() === wallet.address,
        );
        if (walletIndex === -1) continue;

        const preBalance = tx.meta.preBalances[walletIndex] ?? 0;
        const postBalance = tx.meta.postBalances[walletIndex] ?? 0;
        const delta = postBalance - preBalance;
        if (delta <= 0) continue;

        await txRepo.createTransaction({
          type: TXN_TYPES.DEPOSIT,
          receiverId: wallet.userId,
          chain: "solana",
          token: "native",
          tokenSymbol: "SOL",
          amount: delta.toString(),
          txHash: sig.signature,
          isTestnet,
          status: "completed",
        });

        logger.info(
          { address: wallet.address, txHash: sig.signature, amount: delta },
          "SOL deposit credited via polling",
        );
      }
    } catch (err) {
      logger.error({ err, address: wallet.address }, "Solana deposit poll failed for wallet");
    }
  }
}

async function runPoll(): Promise<void> {
  for (const isTestnet of [false, true]) {
    for (const chainId of CHAIN_IDS) {
      const chain = getChain(chainId);
      try {
        if (chain.type === "solana") {
          await pollSolanaChain(isTestnet);
        } else {
          await pollEvmChain(chainId, isTestnet);
        }
      } catch (err) {
        logger.error({ err, chain: chainId, isTestnet }, "Chain deposit poll failed");
      }
    }
  }
}

export function startDepositPoller(): void {
  runPoll().catch((err) => logger.error({ err }, "Initial deposit poll failed"));
  setInterval(() => {
    runPoll().catch((err) => logger.error({ err }, "Deposit poll failed"));
  }, LIMITS.depositPollIntervalMs).unref();
  logger.info(`Deposit poller started — interval: ${LIMITS.depositPollIntervalMs}ms`);
}
