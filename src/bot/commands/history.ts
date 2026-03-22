import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as txRepo from "../../database/repositories/transaction.repo.js";
import { getChain } from "../../blockchain/chains.js";
import { brandEmbed, errorEmbed } from "../components/embeds.js";
import { EMOJIS, LIMITS } from "../../utils/constants.js";
import { formatTokenAmount, timeAgo } from "../../utils/format.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("View your transaction history")
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("Filter by transaction type")
      .addChoices(
        { name: "Tips", value: "tip" },
        { name: "Rain", value: "rain" },
        { name: "Airdrops", value: "airdrop" },
        { name: "Deposits", value: "deposit" },
        { name: "Withdrawals", value: "withdraw" },
      ),
  )
  .addIntegerOption((opt) =>
    opt.setName("page").setDescription("Page number").setMinValue(1),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const type = interaction.options.getString("type") || undefined;
  const page = interaction.options.getInteger("page") || 1;
  const user = await userRepo.findOrCreateUser(interaction.user.id);

  const offset = (page - 1) * LIMITS.maxHistoryPerPage;
  const transactions = await txRepo.getUserTransactions(user.id, {
    type,
    isTestnet,
    limit: LIMITS.maxHistoryPerPage,
    offset,
  });

  if (transactions.length === 0) {
    await interaction.editReply({
      embeds: [
        brandEmbed()
          .setTitle(`${EMOJIS.history} Transaction History`)
          .setDescription("No transactions found."),
      ],
    });
    return;
  }

  const typeEmojis: Record<string, string> = {
    tip: EMOJIS.tip,
    rain: EMOJIS.rain,
    airdrop: EMOJIS.airdrop,
    deposit: EMOJIS.deposit,
    withdraw: EMOJIS.withdraw,
  };

  const lines = transactions.map((tx) => {
    const emoji = typeEmojis[tx.type] || "📝";
    const chain = getChain(tx.chain);
    const isSender = tx.senderId === user.id;
    const direction = isSender ? "→ Sent" : "← Received";
    const time = timeAgo(tx.createdAt);

    return `${emoji} **${tx.type.toUpperCase()}** ${direction} ${formatTokenAmount(tx.amount, chain.nativeDecimals)} ${tx.tokenSymbol} on ${chain.emoji} ${chain.name} — ${time}`;
  });

  const embed = brandEmbed()
    .setTitle(`${EMOJIS.history} Transaction History`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `Page ${page} — ${isTestnet ? "Testnet" : "Mainnet"}`,
    });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute } satisfies BotCommand;
