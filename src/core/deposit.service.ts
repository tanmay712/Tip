import { PublicKey } from "@solana/web3.js";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { prisma } from "../database/client.js";
import { getChain, CHAIN_IDS, getExplorerTxUrl } from "../blockchain/chains.js";
import { getAlchemy } from "../blockchain/alchemy.js";
import { getSolanaConnection } from "../blockchain/solana.js";
import { getLitecoinTransactions, getLitecoinTransaction, isLitecoinConfigured } from "../blockchain/litecoin.js";
import { TXN_TYPES, LIMITS, SECURITY_LIMITS } from "../utils/constants.js";
import { formatTokenAmount } from "../utils/format.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { logSecurityEvent } from "../utils/security.js";
import type { AlchemyWebhookEvent } from "../blockchain/webhooks.js";
import { dmUser, logToAllChannels } from "../bot/notifications.js";
import { brandEmbed } from "../bot/components/embeds.js";

const lastProcessedBlock = new Map<string, string>();

async function notifyDeposit(params: {
  userId: string;
  chainId: string;
  tokenSymbol: string;
  rawAmount: string;
  decimals: number;
  txHash: string;
  isTestnet: boolean;
}): Promise<void> {
  const prismaUser = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { discordId: true },
  });
  if (!prismaUser) return;

  const chain = getChain(params.chainId);
  const formatted = formatTokenAmount(params.rawAmount, params.decimals);
  const txUrl = getExplorerTxUrl(params.chainId, params.txHash, params.isTestnet);
  const networkLabel = params.isTestnet ? "🟡 Testnet" : "🟢 Mainnet";

  const embed = brandEmbed()
    .setColor(0x00ff88)
    .setTitle("📥 Deposit Confirmed")
    .setDescription(
      `Your deposit landed on ${chain.emoji} **${chain.name}**. Your balance has been updated.`,
    )
    .addFields(
      { name: "💰 Amount", value: `\`${formatted} ${params.tokenSymbol}\``, inline: true },
      { name: "⛓️ Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "🌐 Network", value: networkLabel, inline: true },
      { name: "🔗 Transaction", value: `[View on Explorer](${txUrl})`, inline: false },
    )
    .setFooter({ text: "Crypto" });

  await dmUser(prismaUser.discordId, [embed]);

  // Log to all configured guild log channels
  const logEmbed = brandEmbed()
    .setColor(0x00ff88)
    .setTitle("📥 Deposit Received")
    .setDescription(`<@${prismaUser.discordId}> deposited **${formatted} ${params.tokenSymbol}** on ${chain.emoji} ${chain.name}`)
    .addFields(
      { name: "Amount", value: `\`${formatted} ${params.tokenSymbol}\``, inline: true },
      { name: "Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "Transaction", value: `[Explorer](${txUrl})`, inline: true },
    )
    .setFooter({ text: networkLabel });
  logToAllChannels([logEmbed]).catch(() => {});
}

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

    const chain = getChain(wallet.chain);

    // Dust filter — ignore deposits below minimum threshold
    const minRaw = SECURITY_LIMITS.minDepositRaw[wallet.chain];
    if (minRaw && BigInt(rawAmount) < BigInt(minRaw)) {
      logSecurityEvent({
        type: "DUST_DEPOSIT_IGNORED",
        chainId: wallet.chain,
        amount: rawAmount,
        decimals: chain.nativeDecimals,
        tokenSymbol,
        txHash: activity.hash,
        isTestnet: wallet.isTestnet,
        extra: { address: toAddress },
      });
      continue;
    }

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

    // Alert on large deposits
    const largeRaw = SECURITY_LIMITS.largeDepositRaw[wallet.chain];
    const isLarge = largeRaw && BigInt(rawAmount) >= BigInt(largeRaw);
    logSecurityEvent({
      type: isLarge ? "LARGE_DEPOSIT" : "DEPOSIT_CREDITED",
      chainId: wallet.chain,
      amount: rawAmount,
      decimals: chain.nativeDecimals,
      tokenSymbol,
      txHash: activity.hash,
      isTestnet: wallet.isTestnet,
      extra: { address: toAddress },
    });

    notifyDeposit({
      userId: wallet.userId,
      chainId: wallet.chain,
      tokenSymbol,
      rawAmount,
      decimals: chain.nativeDecimals,
      txHash: activity.hash,
      isTestnet: wallet.isTestnet,
    }).catch(() => {});

    credited++;
    logger.info(
      { address: toAddress, chain: wallet.chain, txHash: activity.hash, amount: rawAmount },
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

        // Dust filter
        const minRaw = SECURITY_LIMITS.minDepositRaw[chainId];
        if (minRaw && BigInt(rawAmount) < BigInt(minRaw)) {
          logSecurityEvent({
            type: "DUST_DEPOSIT_IGNORED",
            chainId,
            amount: rawAmount,
            decimals: chain.nativeDecimals,
            tokenSymbol,
            txHash: hash,
            isTestnet,
            extra: { address: wallet.address },
          });
          continue;
        }

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

        // Large deposit alert
        const largeRaw = SECURITY_LIMITS.largeDepositRaw[chainId];
        const isLarge = largeRaw && BigInt(rawAmount) >= BigInt(largeRaw);
        logSecurityEvent({
          type: isLarge ? "LARGE_DEPOSIT" : "DEPOSIT_CREDITED",
          chainId,
          amount: rawAmount,
          decimals: chain.nativeDecimals,
          tokenSymbol,
          txHash: hash,
          isTestnet,
          extra: { address: wallet.address },
        });

        notifyDeposit({
          userId: wallet.userId,
          chainId,
          tokenSymbol,
          rawAmount,
          decimals: chain.nativeDecimals,
          txHash: hash,
          isTestnet,
        }).catch(() => {});

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

        const deltaStr = delta.toString();

        // Dust filter
        const minRaw = SECURITY_LIMITS.minDepositRaw["solana"];
        if (minRaw && BigInt(deltaStr) < BigInt(minRaw)) {
          logSecurityEvent({
            type: "DUST_DEPOSIT_IGNORED",
            chainId: "solana",
            amount: deltaStr,
            decimals: 9,
            tokenSymbol: "SOL",
            txHash: sig.signature,
            isTestnet,
            extra: { address: wallet.address },
          });
          continue;
        }

        await txRepo.createTransaction({
          type: TXN_TYPES.DEPOSIT,
          receiverId: wallet.userId,
          chain: "solana",
          token: "native",
          tokenSymbol: "SOL",
          amount: deltaStr,
          txHash: sig.signature,
          isTestnet,
          status: "completed",
        });

        // Large deposit alert
        const largeRaw = SECURITY_LIMITS.largeDepositRaw["solana"];
        const isLarge = largeRaw && BigInt(deltaStr) >= BigInt(largeRaw);
        logSecurityEvent({
          type: isLarge ? "LARGE_DEPOSIT" : "DEPOSIT_CREDITED",
          chainId: "solana",
          amount: deltaStr,
          decimals: 9,
          tokenSymbol: "SOL",
          txHash: sig.signature,
          isTestnet,
          extra: { address: wallet.address },
        });

        notifyDeposit({
          userId: wallet.userId,
          chainId: "solana",
          tokenSymbol: "SOL",
          rawAmount: deltaStr,
          decimals: 9,
          txHash: sig.signature,
          isTestnet,
        }).catch(() => {});

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

let warnedLitecoinProviderMissing = false;
async function pollLitecoinChain(isTestnet: boolean): Promise<void> {
  if (!isLitecoinConfigured()) {
    if (!warnedLitecoinProviderMissing) {
      logger.warn("Litecoin deposit polling is disabled; configure LITECOIN_API_TOKEN");
      warnedLitecoinProviderMissing = true;
    }
    return;
  }
  const pendingWithdrawals = await prisma.transaction.findMany({
    where: { chain: "litecoin", token: "native", isTestnet, type: TXN_TYPES.WITHDRAW, status: "pending", txHash: { not: null } },
    select: { id: true, txHash: true },
  });
  for (const withdrawal of pendingWithdrawals as Array<{ id: string; txHash: string | null }>) {
    if (!withdrawal.txHash) continue;
    try {
      const transaction = await getLitecoinTransaction(withdrawal.txHash, isTestnet);
      if (transaction.hash?.toLowerCase() === withdrawal.txHash.toLowerCase() && (transaction.confirmations ?? 0) >= 1) {
        await txRepo.updateTransactionStatus(withdrawal.id, "completed", withdrawal.txHash);
        logger.info({ txHash: withdrawal.txHash, isTestnet }, "Litecoin withdrawal confirmed");
      }
    } catch (err) {
      logger.warn({ err, txHash: withdrawal.txHash, isTestnet }, "Could not verify pending Litecoin withdrawal");
    }
  }

  const wallets = await walletRepo.getWalletsByChain("litecoin", isTestnet);
  if (wallets.length === 0) return;

  for (const wallet of wallets) {
    try {
      const transactions = await getLitecoinTransactions(wallet.address, isTestnet);
      for (const transaction of transactions) {
        if (!/^[0-9a-f]{64}$/i.test(transaction.hash ?? "")) continue;
        const txHash = transaction.hash.toLowerCase();
        if (!Number.isSafeInteger(transaction.confirmations) || (transaction.confirmations ?? 0) < config.litecoin.confirmations) continue;
        const rawAmount = (transaction.outputs ?? []).reduce((sum, output) => {
          const sentToWallet = output.addresses?.some((address) => address === wallet.address);
          if (!sentToWallet || !Number.isSafeInteger(output.value) || (output.value ?? 0) <= 0) return sum;
          return sum + BigInt(output.value!);
        }, 0n);
        if (rawAmount <= 0n) continue;

        const existing = await txRepo.findTransactionByTxHash({
          txHash,
          type: TXN_TYPES.DEPOSIT,
          chain: "litecoin",
          isTestnet,
          receiverId: wallet.userId,
        });
        if (existing) continue;

        const minRaw = SECURITY_LIMITS.minDepositRaw.litecoin;
        if (minRaw && rawAmount < BigInt(minRaw)) continue;
        const amount = rawAmount.toString();
        await txRepo.createTransaction({
          type: TXN_TYPES.DEPOSIT,
          receiverId: wallet.userId,
          chain: "litecoin",
          token: "native",
          tokenSymbol: "LTC",
          amount,
          txHash,
          isTestnet,
          status: "completed",
        });
        const largeRaw = SECURITY_LIMITS.largeDepositRaw.litecoin;
        const isLarge = largeRaw ? rawAmount >= BigInt(largeRaw) : false;
        logSecurityEvent({
          type: isLarge ? "LARGE_DEPOSIT" : "DEPOSIT_CREDITED",
          chainId: "litecoin",
          amount,
          decimals: 8,
          tokenSymbol: "LTC",
          txHash,
          isTestnet,
          extra: { address: wallet.address, confirmations: transaction.confirmations ?? 0 },
        });
        notifyDeposit({
          userId: wallet.userId,
          chainId: "litecoin",
          tokenSymbol: "LTC",
          rawAmount: amount,
          decimals: 8,
          txHash,
          isTestnet,
        }).catch(() => {});
        logger.info({ address: wallet.address, txHash, amount }, "LTC deposit credited after confirmations");
      }
    } catch (err) {
      logger.error({ err, address: wallet.address, isTestnet }, "Litecoin deposit poll failed for wallet");
    }
  }
}

let depositPollRunning = false;
async function runPoll(): Promise<void> {
  if (depositPollRunning) return;
  depositPollRunning = true;
  try {
    for (const isTestnet of [false, true]) {
      for (const chainId of CHAIN_IDS) {
        const chain = getChain(chainId);
        try {
          if (chain.type === "solana") {
            await pollSolanaChain(isTestnet);
          } else if (chain.type === "litecoin") {
            await pollLitecoinChain(isTestnet);
          } else {
            await pollEvmChain(chainId, isTestnet);
          }
        } catch (err) {
          logger.error({ err, chain: chainId, isTestnet }, "Chain deposit poll failed");
        }
      }
    }
  } finally {
    depositPollRunning = false;
  }
}

export function startDepositPoller(): void {
  runPoll().catch((err) => logger.error({ err }, "Initial deposit poll failed"));
  setInterval(() => {
    runPoll().catch((err) => logger.error({ err }, "Deposit poll failed"));
  }, LIMITS.depositPollIntervalMs).unref();
  logger.info(`Deposit poller started — interval: ${LIMITS.depositPollIntervalMs}ms`);
}
