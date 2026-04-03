import { ethers } from "ethers";
import { Keypair } from "@solana/web3.js";
import * as userRepo from "../database/repositories/user.repo.js";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getChain } from "../blockchain/chains.js";
import { getEvmProvider, waitForTransaction } from "../blockchain/provider.js";
import { transferSol, transferSplToken } from "../blockchain/solana.js";
import { getPrivateKey } from "./wallet.service.js";
import { TXN_TYPES } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

/**
 * Result of a withdrawal operation
 */
export interface WithdrawResult {
  success: boolean;
  error?: string;
  txHash?: string;
  chain: string;
  amount: string;
  tokenSymbol: string;
}

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

/**
 * Withdraw tokens to an external wallet address
 * @param discordId - Discord ID of the user
 * @param toAddress - Destination wallet address
 * @param amount - Amount to withdraw in raw units
 * @param tokenSymbol - Token symbol (e.g., "ETH", "USDC")
 * @param chainId - Blockchain identifier (e.g., "ethereum", "polygon")
 * @param token - Token identifier ("native" or contract address)
 * @param decimals - Token decimals for amount formatting
 * @param isTestnet - Whether to use testnet or mainnet
 * @returns WithdrawResult with transaction details
 */
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
  const chain = getChain(chainId);
  const user = await userRepo.findOrCreateUser(discordId);

  // Check internal balance
  const balance = await txRepo.getUserBalance(
    user.id,
    chainId,
    token,
    isTestnet,
  );
  const amountBigInt = BigInt(amount);

  if (balance < amountBigInt) {
    return {
      success: false,
      error: "Insufficient balance",
      chain: chainId,
      amount,
      tokenSymbol,
    };
  }

  const wallet = await walletRepo.getWallet(user.id, chainId, isTestnet);
  if (!wallet) {
    return {
      success: false,
      error: "No wallet found for this chain",
      chain: chainId,
      amount,
      tokenSymbol,
    };
  }

  const pk = getPrivateKey(wallet.encryptedKey);
  let txHash: string;

  try {
    if (chain.type === "solana") {
      const keypair = Keypair.fromSecretKey(Buffer.from(pk, "hex"));
      if (token === "native") {
        txHash = await transferSol(keypair, toAddress, amountBigInt, isTestnet);
      } else {
        txHash = await transferSplToken(
          keypair,
          toAddress,
          token,
          amountBigInt,
          isTestnet,
        );
      }
    } else {
      const provider = getEvmProvider(chainId, isTestnet);
      const signer = new ethers.Wallet(pk, provider);

      if (token === "native") {
        const tx = await signer.sendTransaction({
          to: toAddress,
          value: amountBigInt,
        });
        txHash = tx.hash;
      } else {
        const contract = new ethers.Contract(token, ERC20_ABI, signer);
        const tx = await contract.transfer(toAddress, amountBigInt);
        txHash = tx.hash;
      }

      // Ensure the transaction actually got mined successfully before
      // recording the withdrawal as completed.
      const receipt = await waitForTransaction(chainId, isTestnet, txHash, 1);
      if (!receipt || receipt.status !== 1) {
        return {
          success: false,
          error: "Transaction reverted",
          chain: chainId,
          amount,
          tokenSymbol,
        };
      }
    }
  } catch (err) {
    logger.error({ err, discordId, chain: chainId }, "Withdraw failed");
    return {
      success: false,
      error: `Transaction failed: ${(err as Error).message}`,
      chain: chainId,
      amount,
      tokenSymbol,
    };
  }

  // Record the withdrawal
  await txRepo.createTransaction({
    type: TXN_TYPES.WITHDRAW,
    senderId: user.id,
    chain: chainId,
    token,
    tokenSymbol,
    amount,
    txHash,
    isTestnet,
    status: "completed",
  });

  logger.info(
    { discordId, chain: chainId, amount, txHash },
    "Withdrawal completed",
  );

  return {
    success: true,
    txHash,
    chain: chainId,
    amount,
    tokenSymbol,
  };
}
