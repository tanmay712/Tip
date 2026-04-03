import * as userRepo from "../database/repositories/user.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getOrCreateWallet } from "./wallet.service.js";
import { TXN_TYPES, LIMITS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

/**
 * Result of a rain operation
 */
export interface RainResult {
  success: boolean;
  error?: string;
  perUser: string;
  recipients: number;
  totalAmount: string;
  tokenSymbol: string;
  chain: string;
}

/**
 * Distribute tokens evenly among multiple recipients (rain)
 * @param senderDiscordId - Discord ID of the sender
 * @param recipientDiscordIds - Array of Discord IDs to receive tokens
 * @param totalAmount - Total amount to distribute in raw units
 * @param tokenSymbol - Token symbol (e.g., "ETH", "USDC")
 * @param chainId - Blockchain identifier (e.g., "ethereum", "polygon")
 * @param token - Token identifier ("native" or contract address)
 * @param isTestnet - Whether to use testnet or mainnet
 * @returns RainResult with distribution details
 */
export async function sendRain(
  senderDiscordId: string,
  recipientDiscordIds: string[],
  totalAmount: string,
  tokenSymbol: string,
  chainId: string,
  token: string,
  isTestnet: boolean,
): Promise<RainResult> {
  const recipients = recipientDiscordIds.slice(0, LIMITS.maxRainRecipients);
  if (recipients.length === 0) {
    return {
      success: false,
      error: "No eligible recipients found",
      perUser: "0",
      recipients: 0,
      totalAmount,
      tokenSymbol,
      chain: chainId,
    };
  }

  const sender = await userRepo.findOrCreateUser(senderDiscordId);
  const balance = await txRepo.getUserBalance(
    sender.id,
    chainId,
    token,
    isTestnet,
  );
  const totalBigInt = BigInt(totalAmount);

  if (balance < totalBigInt) {
    return {
      success: false,
      error: `Insufficient balance`,
      perUser: "0",
      recipients: recipients.length,
      totalAmount,
      tokenSymbol,
      chain: chainId,
    };
  }

  const perUserAmount = totalBigInt / BigInt(recipients.length);
  const perUser = perUserAmount.toString();

  for (const recipientId of recipients) {
    await getOrCreateWallet(recipientId, chainId, isTestnet);
    const receiver = await userRepo.findOrCreateUser(recipientId);

    await txRepo.createTransaction({
      type: TXN_TYPES.RAIN,
      senderId: sender.id,
      receiverId: receiver.id,
      chain: chainId,
      token,
      tokenSymbol,
      amount: perUser,
      isTestnet,
      status: "completed",
    });
  }

  logger.info(
    { sender: senderDiscordId, recipients: recipients.length, totalAmount, chain: chainId },
    "Rain distributed",
  );

  return {
    success: true,
    perUser,
    recipients: recipients.length,
    totalAmount,
    tokenSymbol,
    chain: chainId,
  };
}
