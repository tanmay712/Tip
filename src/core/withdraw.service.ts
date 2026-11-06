import { ethers } from "ethers";
import { Keypair } from "@solana/web3.js";
import * as userRepo from "../database/repositories/user.repo.js";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getChain, getExplorerTxUrl } from "../blockchain/chains.js";
import { getEvmProvider, waitForTransaction } from "../blockchain/provider.js";
import { transferSol, transferSplToken } from "../blockchain/solana.js";
import { prepareLitecoinWithdrawal, broadcastLitecoinWithdrawal, getLitecoinReserve, isLitecoinConfigured } from "../blockchain/litecoin.js";
import { prisma } from "../database/client.js";
import { getPrivateKey, getOrCreateWallet } from "./wallet.service.js";
import { TXN_TYPES, SECURITY_LIMITS } from "../utils/constants.js";
import { formatTokenAmount, truncateAddress } from "../utils/format.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { logSecurityEvent } from "../utils/security.js";
import { dmUser, logToAllChannels } from "../bot/notifications.js";
import { brandEmbed } from "../bot/components/embeds.js";

export interface WithdrawResult {
  success: boolean;
  error?: string;
  txHash?: string;
  chain: string;
  amount: string;
  tokenSymbol: string;
  networkFee?: string;
}

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

const litecoinWithdrawalLocks = new Map<string, Promise<void>>();

export async function withdraw(
  discordId: string,
  toAddress: string,
  amount: string,
  tokenSymbol: string,
  chainId: string,
  token: string,
  decimals: number,
  isTestnet: boolean,
): Promise<WithdrawResult> {
  if (chainId !== "litecoin") {
    return withdrawUnlocked(discordId, toAddress, amount, tokenSymbol, chainId, token, decimals, isTestnet);
  }
  const key = isTestnet ? "testnet" : "mainnet";
  const previous = litecoinWithdrawalLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  litecoinWithdrawalLocks.set(key, current);
  await previous;
  try {
    return await withdrawUnlocked(discordId, toAddress, amount, tokenSymbol, chainId, token, decimals, isTestnet);
  } finally {
    release();
    if (litecoinWithdrawalLocks.get(key) === current) litecoinWithdrawalLocks.delete(key);
  }
}

async function withdrawUnlocked(
  discordId: string,
  toAddress: string,
  amount: string,
  tokenSymbol: string,
  chainId: string,
  token: string,
  decimals: number,
  isTestnet: boolean,
): Promise<WithdrawResult> {
  const chain = getChain(chainId);
  const user = await userRepo.findOrCreateUser(discordId);

  const balance = await txRepo.getUserBalance(user.id, chainId, token, isTestnet);
  const amountBigInt = BigInt(amount);

  if (balance < amountBigInt) {
    return { success: false, error: "Insufficient balance", chain: chainId, amount, tokenSymbol };
  }

  let wallet = await walletRepo.getWallet(user.id, chainId, isTestnet);
  if (!wallet && chain.type === "litecoin") {
    await getOrCreateWallet(discordId, chainId, isTestnet);
    wallet = await walletRepo.getWallet(user.id, chainId, isTestnet);
  }
  if (!wallet) {
    return { success: false, error: "No wallet found for this chain", chain: chainId, amount, tokenSymbol };
  }

  const pk = getPrivateKey(wallet.encryptedKey);
  let txHash: string;
  let networkFee: string | undefined;
  let reservationId: string | undefined;
  let transactionRecorded = false;
  let broadcastAccepted = false;
  let broadcastAttempted = false;
  let ledgerAmount = amount;

  try {
    if (chain.type === "solana") {
      const keypair = Keypair.fromSecretKey(Buffer.from(pk, "hex"));
      if (token === "native") {
        txHash = await transferSol(keypair, toAddress, amountBigInt, isTestnet);
      } else {
        txHash = await transferSplToken(keypair, toAddress, token, amountBigInt, isTestnet);
      }
    } else if (chain.type === "litecoin") {
      if (token !== "native") throw new Error("Only native LTC withdrawals are supported");
      if (!isLitecoinConfigured()) throw new Error("Litecoin provider is not configured");
      if (amountBigInt < 10_000n) throw new Error("Litecoin withdrawal is below the 0.0001 LTC minimum");

      const ltcWallets = await walletRepo.getWalletsByChain(chainId, isTestnet);
      const signers: Array<{ address: string; privateKeyHex: string }> = ltcWallets.map((entry: { address: string; encryptedKey: string }) => ({
        address: entry.address,
        privateKeyHex: getPrivateKey(entry.encryptedKey),
      }));
      if (signers.length === 0) throw new Error("No Litecoin signing wallets are configured");

      const reserve = await getLitecoinReserve(signers.map((signer) => signer.address), isTestnet);
      const liabilityRows = await prisma.transaction.findMany({
        where: { chain: chainId, token: "native", isTestnet, status: { in: ["completed", "pending"] } },
        select: { amount: true, senderId: true, receiverId: true },
      });
      let liabilities = 0n;
      for (const row of liabilityRows) {
        const value = BigInt(row.amount);
        if (row.receiverId) liabilities += value;
        if (row.senderId) liabilities -= value;
      }
      if (liabilities < 0n || reserve < liabilities) {
        throw new Error("Litecoin reserve is below recorded user balances; withdrawals are paused for operator review");
      }

      const prepared = await prepareLitecoinWithdrawal(signers, toAddress, amountBigInt, isTestnet);
      if (prepared.feeSatoshis > BigInt(config.litecoin.maxWithdrawalFeeSatoshis)) {
        throw new Error("Litecoin provider fee exceeds the configured maximum withdrawal fee");
      }
      networkFee = prepared.feeSatoshis.toString();
      const totalDebit = amountBigInt + prepared.feeSatoshis;
      if (balance < totalDebit) {
        return { success: false, error: `Insufficient balance including network fee (${formatTokenAmount(prepared.feeSatoshis.toString(), decimals)} ${tokenSymbol})`, chain: chainId, amount, tokenSymbol, networkFee };
      }

      ledgerAmount = totalDebit.toString();
      const reservation = await txRepo.createTransaction({
        type: TXN_TYPES.WITHDRAW,
        senderId: user.id,
        chain: chainId,
        token,
        tokenSymbol,
        amount: ledgerAmount,
        isTestnet,
        status: "pending",
      });
      reservationId = reservation.id;
      transactionRecorded = true;
      try {
        broadcastAttempted = true;
        txHash = await broadcastLitecoinWithdrawal(prepared.skeleton, prepared.expectedTxHash, isTestnet);
        broadcastAccepted = true;
      } catch (err) {
        // A timeout can occur after the provider accepted the transaction. Keep funds reserved
        // until the operator can reconcile the provider/chain state; never risk a duplicate spend.
        logger.error({ err, reservationId: reservation.id }, "Litecoin broadcast result is uncertain; withdrawal remains reserved for reconciliation");
        reservationId = undefined;
        throw err;
      }
      try {
        await txRepo.updateTransactionStatus(reservation.id, "pending", txHash);
        reservationId = undefined;
      } catch (err) {
        // Keep the debit reserved as pending if broadcast succeeded but the DB update failed.
        logger.error({ err, txHash, reservationId: reservation.id }, "Litecoin broadcast succeeded but transaction hash update failed");
      }
    } else {
      const provider = getEvmProvider(chainId, isTestnet);
      const signer = new ethers.Wallet(pk, provider);

      if (token === "native") {
        const tx = await signer.sendTransaction({ to: toAddress, value: amountBigInt });
        txHash = tx.hash;
      } else {
        const contract = new ethers.Contract(token, ERC20_ABI, signer);
        const tx = await contract.transfer(toAddress, amountBigInt);
        txHash = tx.hash;
      }

      const receipt = await waitForTransaction(chainId, isTestnet, txHash, 1);
      if (!receipt || receipt.status !== 1) {
        return { success: false, error: "Transaction reverted", chain: chainId, amount, tokenSymbol };
      }
    }
  } catch (err) {
    if (reservationId && !broadcastAccepted) {
      await txRepo.updateTransactionStatus(reservationId, "failed").catch(() => {});
    }
    logger.error({ err, discordId, chain: chainId, amount, tokenSymbol }, "Withdraw failed");
    logSecurityEvent({
      type: "WITHDRAWAL_FAILED",
      discordId,
      chainId,
      amount,
      decimals,
      tokenSymbol,
      isTestnet,
      extra: { error: (err as Error).message, to: toAddress },
    });
    return {
      success: false,
      error: broadcastAttempted
        ? `Litecoin broadcast outcome is uncertain; your balance remains reserved for operator reconciliation. Reference: ${(err as Error).message}`
        : `Transaction failed: ${(err as Error).message}`,
      chain: chainId,
      amount,
      tokenSymbol,
    };
  }

  if (!transactionRecorded) {
    await txRepo.createTransaction({
      type: TXN_TYPES.WITHDRAW,
      senderId: user.id,
      chain: chainId,
      token,
      tokenSymbol,
      amount: ledgerAmount,
      txHash,
      isTestnet,
      status: "completed",
    });
  }

  logger.info({ discordId, chain: chainId, amount, txHash, tokenSymbol }, chain.type === "litecoin" ? "Withdrawal broadcast" : "Withdrawal completed");

  // Security event — always log withdrawals, alert if large
  const largeRaw = SECURITY_LIMITS.largeWithdrawRaw[chainId];
  const isLarge = largeRaw && BigInt(amount) >= BigInt(largeRaw);
  logSecurityEvent({
    type: isLarge ? "LARGE_WITHDRAWAL" : "WITHDRAWAL_COMPLETED",
    discordId,
    chainId,
    amount,
    decimals,
    tokenSymbol,
    txHash,
    isTestnet,
    extra: { to: toAddress },
  });

  // DM the user to confirm
  const chain2 = getChain(chainId);
  const formatted = formatTokenAmount(amount, decimals);
  const txUrl = getExplorerTxUrl(chainId, txHash, isTestnet);
  const networkLabel = isTestnet ? "🟡 Testnet" : "🟢 Mainnet";

  const withdrawDmEmbed = brandEmbed()
    .setColor(0xf5a623)
    .setTitle(chain.type === "litecoin" ? "📤 Withdrawal Broadcast" : "📤 Withdrawal Confirmed")
    .setDescription(
      `**${formatted} ${tokenSymbol}** sent on ${chain2.emoji} **${chain2.name}**.`,
    )
    .addFields(
      { name: "Amount", value: `\`${formatted} ${tokenSymbol}\``, inline: true },
      { name: "To", value: `\`${truncateAddress(toAddress)}\``, inline: true },
      { name: "Network", value: networkLabel, inline: true },
      { name: "Transaction", value: `[View on Explorer](${txUrl})`, inline: false },
      ...(networkFee ? [{ name: "Network fee", value: `\`${formatTokenAmount(networkFee, decimals)} ${tokenSymbol}\``, inline: true }] : []),
    )
    .setFooter({ text: "Crypto" });

  dmUser(discordId, [withdrawDmEmbed]).catch(() => {});

  // Log to all configured guild log channels
  const logEmbed = brandEmbed()
    .setColor(0xf5a623)
    .setTitle("📤 Withdrawal Sent")
    .setDescription(`<@${discordId}> withdrew **${formatted} ${tokenSymbol}** on ${chain2.emoji} ${chain2.name}`)
    .addFields(
      { name: "To", value: `\`${truncateAddress(toAddress)}\``, inline: true },
      { name: "Transaction", value: `[Explorer](${txUrl})`, inline: true },
    )
    .setFooter({ text: networkLabel });
  logToAllChannels([logEmbed]).catch(() => {});

  return { success: true, txHash, chain: chainId, amount, tokenSymbol, networkFee };
}
