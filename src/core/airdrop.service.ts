import * as userRepo from "../database/repositories/user.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import * as airdropRepo from "../database/repositories/airdrop.repo.js";
import { getOrCreateWallet } from "./wallet.service.js";
import { LIMITS, TXN_TYPES } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

export interface CreateAirdropResult {
  success: boolean;
  error?: string;
  airdropId?: string;
  totalAmount: string;
  perClaim: string;
  maxClaims: number;
}

export async function createAirdrop(
  creatorDiscordId: string,
  guildId: string,
  channelId: string,
  totalAmount: string,
  tokenSymbol: string,
  chainId: string,
  token: string,
  maxClaims: number,
  isTestnet: boolean,
): Promise<CreateAirdropResult> {
  const clampedClaims = Math.min(maxClaims, LIMITS.maxAirdropSlots);
  const totalBigInt = BigInt(totalAmount);

  const perClaimBigInt = totalBigInt / BigInt(clampedClaims);
  const reservedAmountBigInt = perClaimBigInt * BigInt(clampedClaims);
  const perClaim = perClaimBigInt.toString();

  const creator = await userRepo.findOrCreateUser(creatorDiscordId);
  const balance = await txRepo.getUserBalance(creator.id, chainId, token, isTestnet);

  if (balance < reservedAmountBigInt) {
    return {
      success: false,
      error: "Insufficient balance",
      totalAmount: reservedAmountBigInt.toString(),
      perClaim,
      maxClaims: clampedClaims,
    };
  }

  await txRepo.createTransaction({
    type: TXN_TYPES.AIRDROP,
    senderId: creator.id,
    chain: chainId,
    token,
    tokenSymbol,
    amount: reservedAmountBigInt.toString(),
    isTestnet,
    status: "completed",
  });

  const expiresAt = new Date(Date.now() + LIMITS.airdropExpiryMinutes * 60 * 1000);

  const airdrop = await airdropRepo.createAirdrop({
    creatorId: creator.id,
    guildId,
    channelId,
    chain: chainId,
    token,
    tokenSymbol,
    totalAmount: reservedAmountBigInt.toString(),
    perClaim,
    maxClaims: clampedClaims,
    expiresAt,
  });

  logger.info(
    {
      creator: creatorDiscordId,
      airdropId: airdrop.id,
      totalAmount: reservedAmountBigInt.toString(),
      claims: clampedClaims,
    },
    "Airdrop created",
  );

  return {
    success: true,
    airdropId: airdrop.id,
    totalAmount: reservedAmountBigInt.toString(),
    perClaim,
    maxClaims: clampedClaims,
  };
}

export async function claimAirdrop(
  airdropId: string,
  claimerDiscordId: string,
  isTestnet: boolean,
): Promise<{ success: boolean; error?: string; amount?: string }> {
  const airdrop = await airdropRepo.getAirdrop(airdropId);
  if (!airdrop) return { success: false, error: "Airdrop not found" };

  if (new Date() > airdrop.expiresAt) {
    return { success: false, error: "Airdrop has expired" };
  }

  const claimCount = await airdropRepo.getAirdropClaimCount(airdropId);
  if (claimCount >= airdrop.maxClaims) {
    return { success: false, error: "All slots have been claimed" };
  }

  const claimer = await userRepo.findOrCreateUser(claimerDiscordId);
  if (claimer.id === airdrop.creatorId) {
    return { success: false, error: "You can't claim your own airdrop" };
  }

  const hasClaimed = await airdropRepo.hasClaimedAirdrop(airdropId, claimer.id);
  if (hasClaimed) {
    return { success: false, error: "You already claimed this airdrop" };
  }

  await getOrCreateWallet(claimerDiscordId, airdrop.chain, isTestnet);
  await airdropRepo.claimAirdrop(airdropId, claimer.id);

  await txRepo.createTransaction({
    type: TXN_TYPES.AIRDROP,
    receiverId: claimer.id,
    chain: airdrop.chain,
    token: airdrop.token,
    tokenSymbol: airdrop.tokenSymbol,
    amount: airdrop.perClaim,
    isTestnet,
    status: "completed",
  });

  logger.info(
    { airdropId, claimer: claimerDiscordId, amount: airdrop.perClaim },
    "Airdrop claimed",
  );

  return { success: true, amount: airdrop.perClaim };
}
