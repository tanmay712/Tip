import { PublicKey } from "@solana/web3.js";
import { ethers } from "ethers";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { prisma } from "../database/client.js";
import { getChain, CHAIN_IDS, getExplorerTxUrl } from "../blockchain/chains.js";
import { getEvmProvider } from "../blockchain/provider.js";
import { KNOWN_TOKENS } from "../blockchain/tokens.js";
import { getSolanaConnection } from "../blockchain/solana.js";
import { getLitecoinTransactions, getLitecoinTransaction, isLitecoinConfigured } from "../blockchain/litecoin.js";
import { TXN_TYPES, LIMITS, SECURITY_LIMITS } from "../utils/constants.js";
import { formatTokenAmount } from "../utils/format.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { logSecurityEvent } from "../utils/security.js";
import { dmUser, logToAllChannels } from "../bot/notifications.js";
import { brandEmbed } from "../bot/components/embeds.js";

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

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER_EVENT = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

async function creditEvmDeposit(params: {
  wallet: { userId: string; address: string };
  chainId: string;
  isTestnet: boolean;
  txHash: string;
  token: string;
  tokenSymbol: string;
  decimals: number;
  amount: bigint;
}): Promise<void> {
  if (params.amount <= 0n || !/^[0-9a-f]{64}$/i.test(params.txHash)) return;
  const txHash = params.txHash.toLowerCase();
  const existing = await txRepo.findTransactionByTxHash({
    txHash,
    type: TXN_TYPES.DEPOSIT,
    chain: params.chainId,
    isTestnet: params.isTestnet,
    receiverId: params.wallet.userId,
    token: params.token,
  });
  if (existing) return;

  if (params.token === "native") {
    const minRaw = SECURITY_LIMITS.minDepositRaw[params.chainId];
    if (minRaw && params.amount < BigInt(minRaw)) {
      logSecurityEvent({
        type: "DUST_DEPOSIT_IGNORED",
        chainId: params.chainId,
        amount: params.amount.toString(),
        decimals: params.decimals,
        tokenSymbol: params.tokenSymbol,
        txHash,
        isTestnet: params.isTestnet,
        extra: { address: params.wallet.address },
      });
      return;
    }
  }

  const amount = params.amount.toString();
  await txRepo.createTransaction({
    type: TXN_TYPES.DEPOSIT,
    receiverId: params.wallet.userId,
    chain: params.chainId,
    token: params.token,
    tokenSymbol: params.tokenSymbol,
    amount,
    txHash,
    isTestnet: params.isTestnet,
    status: "completed",
  });

  const largeRaw = params.token === "native" ? SECURITY_LIMITS.largeDepositRaw[params.chainId] : undefined;
  logSecurityEvent({
    type: largeRaw && params.amount >= BigInt(largeRaw) ? "LARGE_DEPOSIT" : "DEPOSIT_CREDITED",
    chainId: params.chainId,
    amount,
    decimals: params.decimals,
    tokenSymbol: params.tokenSymbol,
    txHash,
    isTestnet: params.isTestnet,
    extra: { address: params.wallet.address },
  });
  notifyDeposit({
    userId: params.wallet.userId,
    chainId: params.chainId,
    tokenSymbol: params.tokenSymbol,
    rawAmount: amount,
    decimals: params.decimals,
    txHash,
    isTestnet: params.isTestnet,
  }).catch(() => {});
  logger.info({ address: params.wallet.address, chain: params.chainId, txHash, amount, token: params.token }, "Deposit credited from public RPC");
}

async function pollEvmChain(chainId: string, isTestnet: boolean): Promise<void> {
  const wallets = await walletRepo.getWalletsByChain(chainId, isTestnet);
  if (wallets.length === 0) return;

  const provider = getEvmProvider(chainId, isTestnet);
  const latestBlock = await provider.getBlockNumber();
  const confirmedHead = latestBlock - config.rpc.evmConfirmations;
  if (confirmedHead < 0) return;

  const cursorModel = (prisma as any).chainCursor;
  let cursor = await cursorModel.findUnique({ where: { chain_isTestnet: { chain: chainId, isTestnet } } });
  if (!cursor) {
    const initialBlock = Math.max(0, confirmedHead - 1000);
    cursor = await cursorModel.create({ data: { chain: chainId, isTestnet, lastScannedBlock: initialBlock - 1 } });
  }
  const fromBlock = Number(cursor.lastScannedBlock) + 1;
  if (fromBlock > confirmedHead) return;
  const toBlock = Math.min(confirmedHead, fromBlock + config.rpc.blockScanBatchSize - 1);
  const chain = getChain(chainId);
  const walletByAddress = new Map<string, { userId: string; address: string }>(
    wallets.map((wallet: { userId: string; address: string }) => [wallet.address.toLowerCase(), wallet]),
  );

  // Scan top-level native transfers. Read at most five confirmed blocks concurrently.
  const readBlock = (blockNumber: number) => provider.send("eth_getBlockByNumber", [ethers.toQuantity(blockNumber), true]) as Promise<{
    transactions?: Array<{ hash?: string; to?: string | null; value?: string }> | null;
  } | null>;
  for (let batchStart = fromBlock; batchStart <= toBlock; batchStart += 5) {
    const blockNumbers = Array.from({ length: Math.min(5, toBlock - batchStart + 1) }, (_, index) => batchStart + index);
    const blocks = await Promise.all(blockNumbers.map(readBlock));
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      if (!block) throw new Error(`Public RPC returned no block ${blockNumbers[index]}`);
      for (const transaction of block.transactions ?? []) {
        const toAddress = transaction.to?.toLowerCase();
        const wallet = toAddress ? walletByAddress.get(toAddress) : undefined;
        if (!wallet || !transaction.hash || !transaction.value) continue;
        const amount = BigInt(transaction.value);
        if (amount === 0n) continue;
        await creditEvmDeposit({
          wallet,
          chainId,
          isTestnet,
          txHash: transaction.hash,
          token: "native",
          tokenSymbol: chain.nativeToken,
          decimals: chain.nativeDecimals,
          amount,
        });
      }
    }
  }

  // Scan standard ERC-20 Transfer logs for supported contracts and registered recipients.
  const tokenInfos = KNOWN_TOKENS.filter((token) => token.chainId === chainId);
  const tokenInfoByAddress = new Map(tokenInfos.map((token) => [token.contractAddress.toLowerCase(), token]));
  const tokenAddresses = [...tokenInfoByAddress.keys()];
  const recipients = [...walletByAddress.keys()];
  if (tokenAddresses.length > 0) {
    const aggregated = new Map<string, { wallet: { userId: string; address: string }; token: string; tokenSymbol: string; decimals: number; txHash: string; amount: bigint }>();
    for (let offset = 0; offset < recipients.length; offset += 100) {
      const recipientTopics = recipients.slice(offset, offset + 100).map((address) => ethers.zeroPadValue(address, 32));
      const logs = await provider.getLogs({
        fromBlock,
        toBlock,
        address: tokenAddresses,
        topics: [TRANSFER_TOPIC, null, recipientTopics],
      });
      for (const log of logs) {
        const recipientTopic = log.topics[2];
        const toAddress = recipientTopic ? `0x${recipientTopic.slice(-40)}`.toLowerCase() : "";
        const wallet = walletByAddress.get(toAddress);
        const token = tokenInfoByAddress.get(log.address.toLowerCase());
        if (!wallet || !token) continue;
        const parsed = TRANSFER_EVENT.parseLog({ topics: [...log.topics], data: log.data });
        if (!parsed) continue;
        const amount = BigInt(parsed.args.value);
        const key = `${log.transactionHash.toLowerCase()}:${wallet.userId}:${token.contractAddress.toLowerCase()}`;
        const entry = aggregated.get(key);
        if (entry) entry.amount += amount;
        else aggregated.set(key, { wallet, token: token.contractAddress.toLowerCase(), tokenSymbol: token.symbol, decimals: token.decimals, txHash: log.transactionHash, amount });
      }
    }
    for (const transfer of aggregated.values()) {
      await creditEvmDeposit({ wallet: transfer.wallet, chainId, isTestnet, txHash: transfer.txHash, token: transfer.token, tokenSymbol: transfer.tokenSymbol, decimals: transfer.decimals, amount: transfer.amount });
    }
  }

  await cursorModel.update({
    where: { chain_isTestnet: { chain: chainId, isTestnet } },
    data: { lastScannedBlock: toBlock },
  });
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
