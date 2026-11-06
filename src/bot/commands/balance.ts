import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as txRepo from "../../database/repositories/transaction.repo.js";
import { getOrCreateWallet } from "../../core/wallet.service.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import * as rpcApi from "../../blockchain/rpc.js";
import { getSolBalance } from "../../blockchain/solana.js";

import { balanceEmbed, brandEmbed } from "../components/embeds.js";
import { EMOJIS } from "../../utils/constants.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your balances")
  .addStringOption((opt) =>
    opt
      .setName("chain")
      .setDescription("Specific chain (shows all if omitted)")
      .addChoices(...CHAIN_IDS.map((c) => ({ name: getChain(c).name, value: c }))),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const specificChain = interaction.options.getString("chain");
  const chains = specificChain ? [specificChain] : CHAIN_IDS;
  const user = await userRepo.findOrCreateUser(interaction.user.id);

  if (chains.length === 1) {
    const chainId = chains[0];
    const chain = getChain(chainId);
    const address = chain.type === "litecoin"
      ? ""
      : (await getOrCreateWallet(interaction.user.id, chainId, isTestnet)).address;

    const balances: Array<{ symbol: string; amount: string; decimals: number }> = [];

    // On-chain native balance
    let nativeBalance: string;
    if (chain.type === "solana") {
      nativeBalance = await getSolBalance(address, isTestnet);
    } else if (chain.type === "litecoin") {
      nativeBalance = "0"; // LTC balances shown here are pooled internal liabilities, not the address's backing reserve.
    } else {
      nativeBalance = await rpcApi.getBalance(chainId, address, isTestnet);
    }

    // Internal balance (from tips/rain/airdrops)
    const internalBalance = await txRepo.getUserBalance(
      user.id,
      chainId,
      "native",
      isTestnet,
    );

    const totalNative = chain.type === "litecoin"
      ? internalBalance.toString()
      : (BigInt(nativeBalance) + internalBalance).toString();
    balances.push({
      symbol: chain.nativeToken,
      amount: totalNative,
      decimals: chain.nativeDecimals,
    });

    // Token balances (on-chain)
    if (chain.type === "evm") {
      try {
        const tokenBals = await rpcApi.getTokenBalances(chainId, address, isTestnet);
        for (const tb of tokenBals) {
          const meta = await rpcApi.getTokenMetadata(chainId, tb.contractAddress, isTestnet);
          if (meta.symbol) {
            balances.push({
              symbol: meta.symbol,
              amount: tb.balance,
              decimals: meta.decimals ?? 18,
            });
          }
        }
      } catch {
        // Token balance fetch may fail on some chains
      }
    }

    await interaction.editReply({
      embeds: [balanceEmbed({ chainId, balances, isTestnet })],
    });
  } else {
    // Summary across all chains
    const embed = brandEmbed()
      .setTitle(`${EMOJIS.wallet} All Balances`)
      .setDescription(
        isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`,
      );

    for (const chainId of chains) {
      const chain = getChain(chainId);
      const internalBalance = await txRepo.getUserBalance(
        user.id,
        chainId,
        "native",
        isTestnet,
      );

      if (internalBalance > 0n) {
        const { formatTokenAmount } = await import("../../utils/format.js");
        embed.addFields({
          name: `${chain.emoji} ${chain.name}`,
          value: `${formatTokenAmount(internalBalance.toString(), chain.nativeDecimals)} ${chain.nativeToken}`,
          inline: true,
        });
      }
    }

    if (embed.data.fields?.length === 0) {
      embed.setDescription(
        `${embed.data.description}\n\nNo balances yet. Use \`/wallet deposit\` to get started!`,
      );
    }

    await interaction.editReply({ embeds: [embed] });
  }
}

export default { data, execute } satisfies BotCommand;
