import * as userRepo from "../database/repositories/user.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getOrCreateWallet } from "./wallet.service.js";
import { getChain } from "../blockchain/chains.js";
import { TXN_TYPES } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

/**
 * Result of a tip operation
 */
export interface TipResult {
  success: boolean;
  error?: string;
  amount: string;
  tokenSymbol: string;
  chain: string;
}

/**
 * Send an off-chain tip to another user
 * @param senderDiscordId - Discord ID of the sender
 * @param receiverDiscordId - Discord ID of the receiver
 * @param amount - Amount in raw units (wei for EVM, lamports for Solana)
 * @param tokenSymbol - Token symbol (e.g., "ETH", "USDC")
 * @param chainId - Blockchain identifier (e.g., "ethereum", "polygon")
 * @param token - Token identifier ("native" or contract address)
 * @param isTestnet - Whether to use testnet or mainnet
 * @returns TipResult indicating success or failure
 */
export async function sendTip(
  senderDiscordId: string,
  receiverDiscordId: string,
  amount: string,
  tokenSymbol: string,
  chainId: string,
  token: string,
  isTestnet: boolean,
): Promise<TipResult> {
  const chain = getChain(chainId);

  // Ensure both users have wallets
  await getOrCreateWallet(senderDiscordId, chainId, isTestnet);
  await getOrCreateWallet(receiverDiscordId, chainId, isTestnet);

  const sender = await userRepo.findOrCreateUser(senderDiscordId);
  const receiver = await userRepo.findOrCreateUser(receiverDiscordId);

  // Check sender balance
  const balance = await txRepo.getUserBalance(
    sender.id,
    chainId,
    token,
    isTestnet,
  );
  const amountBigInt = BigInt(amount);

  if (balance < amountBigInt) {
    return {
      success: false,
      error: `Insufficient balance. You have ${balance.toString()} but tried to send ${amount}`,
      amount,
      tokenSymbol,
      chain: chainId,
    };
  }

  // Create send transaction (debit sender)
  await txRepo.createTransaction({
    type: TXN_TYPES.TIP,
    senderId: sender.id,
    receiverId: receiver.id,
    chain: chainId,
    token,
    tokenSymbol,
    amount,
    isTestnet,
    status: "completed",
  });

  logger.info(
    { from: senderDiscordId, to: receiverDiscordId, amount, token: tokenSymbol, chain: chainId },
    "Tip sent",
  );

  return {
    success: true,
    amount,
    tokenSymbol,
    chain: chainId,
  };
}
