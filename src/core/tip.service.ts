import * as userRepo from "../database/repositories/user.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getOrCreateWallet } from "./wallet.service.js";
import { getChain } from "../blockchain/chains.js";
import { TXN_TYPES } from "../utils/constants.js";
import { formatTokenAmount } from "../utils/format.js";
import { logger } from "../utils/logger.js";

export interface TipResult {
  success: boolean;
  error?: string;
  amount: string;
  tokenSymbol: string;
  chain: string;
}

export async function sendTip(
  senderDiscordId: string,
  receiverDiscordId: string,
  amount: string,
  tokenSymbol: string,
  chainId: string,
  token: string,
  isTestnet: boolean,
  decimals?: number,
): Promise<TipResult> {
  getChain(chainId);

  await getOrCreateWallet(senderDiscordId, chainId, isTestnet);
  await getOrCreateWallet(receiverDiscordId, chainId, isTestnet);

  const sender = await userRepo.findOrCreateUser(senderDiscordId);
  const receiver = await userRepo.findOrCreateUser(receiverDiscordId);

  const balance = await txRepo.getUserBalance(sender.id, chainId, token, isTestnet);
  const amountBigInt = BigInt(amount);

  if (balance < amountBigInt) {
    const chain = getChain(chainId);
    const dec = decimals ?? chain.nativeDecimals;
    const have = formatTokenAmount(balance.toString(), dec);
    const need = formatTokenAmount(amount, dec);
    return {
      success: false,
      error: `Insufficient balance. You have **${have} ${tokenSymbol}** but tried to send **${need} ${tokenSymbol}**`,
      amount,
      tokenSymbol,
      chain: chainId,
    };
  }

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

  return { success: true, amount, tokenSymbol, chain: chainId };
}
