import { ethers } from "ethers";
import { Keypair } from "@solana/web3.js";
import * as userRepo from "../database/repositories/user.repo.js";
import * as walletRepo from "../database/repositories/wallet.repo.js";
import * as txRepo from "../database/repositories/transaction.repo.js";
import { getChain, getExplorerTxUrl } from "../blockchain/chains.js";
import { getEvmProvider, waitForTransaction } from "../blockchain/provider.js";
import { transferSol, transferSplToken } from "../blockchain/solana.js";
import { getPrivateKey } from "./wallet.service.js";
import { TXN_TYPES } from "../utils/constants.js";
import { formatTokenAmount, truncateAddress } from "../utils/format.js";
import { logger } from "../utils/logger.js";
import { dmUser } from "../bot/notifications.js";
import { brandEmbed } from "../bot/components/embeds.js";

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

  const balance = await txRepo.getUserBalance(user.id, chainId, token, isTestnet);
  const amountBigInt = BigInt(amount);

  if (balance < amountBigInt) {
    return { success: false, error: "Insufficient balance", chain: chainId, amount, tokenSymbol };
  }

  const wallet = await walletRepo.getWallet(user.id, chainId, isTestnet);
  if (!wallet) {
    return { success: false, error: "No wallet found for this chain", chain: chainId, amount, tokenSymbol };
  }

  const pk = getPrivateKey(wallet.encryptedKey);
  let txHash: string;

  try {
    if (chain.type === "solana") {
      const keypair = Keypair.fromSecretKey(Buffer.from(pk, "hex"));
      if (token === "native") {
        txHash = await transferSol(keypair, toAddress, amountBigInt, isTestnet);
      } else {
        txHash = await transferSplToken(keypair, toAddress, token, amountBigInt, isTestnet);
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
    logger.error({ err, discordId, chain: chainId }, "Withdraw failed");
    return {
      success: false,
      error: `Transaction failed: ${(err as Error).message}`,
      chain: chainId,
      amount,
      tokenSymbol,
    };
  }

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

  logger.info({ discordId, chain: chainId, amount, txHash }, "Withdrawal completed");

  // DM the user to confirm
  const chain2 = getChain(chainId);
  const formatted = formatTokenAmount(amount, decimals);
  const txUrl = getExplorerTxUrl(chainId, txHash, isTestnet);
  const networkLabel = isTestnet ? "🟡 Testnet" : "🟢 Mainnet";

  dmUser(discordId, [
    brandEmbed()
      .setColor(0xf5a623)
      .setTitle("📤 Withdrawal Confirmed!")
      .setDescription(
        `Your withdrawal of **${formatted} ${tokenSymbol}** on **${chain2.emoji} ${chain2.name}** has been broadcast and confirmed.`,
      )
      .addFields(
        { name: "Amount", value: `**${formatted} ${tokenSymbol}**`, inline: true },
        { name: "To", value: `\`${truncateAddress(toAddress)}\``, inline: true },
        { name: "Network", value: networkLabel, inline: true },
        { name: "Transaction", value: `[View on Explorer](${txUrl})`, inline: false },
      )
      .setFooter({ text: "Hodlr — Tip crypto. Instantly." }),
  ]).catch(() => {});

  return { success: true, txHash, chain: chainId, amount, tokenSymbol };
}
