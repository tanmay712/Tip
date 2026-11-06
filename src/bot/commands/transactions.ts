import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../../database/client.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { brandEmbed, errorEmbed } from "../components/embeds.js";
import { formatTokenAmount } from "../../utils/format.js";
import { getChain } from "../../blockchain/chains.js";
import { findToken } from "../../blockchain/tokens.js";

function formatTransactionAmount(transaction: { chain: string; token: string; tokenSymbol: string; amount: string }): string {
  const decimals = transaction.token === "native"
    ? getChain(transaction.chain).nativeDecimals
    : findToken(transaction.tokenSymbol, transaction.chain)?.decimals;
  return decimals === undefined
    ? `${transaction.amount} base units`
    : formatTokenAmount(transaction.amount, decimals);
}
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("transactions")
  .setDescription("Review your Crypto transaction records")
  .addSubcommand((sub) => sub.setName("recent").setDescription("Show your latest transactions")
    .addIntegerOption((option) => option.setName("limit").setDescription("Number of entries (1–10)").setMinValue(1).setMaxValue(10)))
  .addSubcommand((sub) => sub.setName("lookup").setDescription("Look up one of your own transaction hashes")
    .addStringOption((option) => option.setName("hash").setDescription("Transaction hash").setRequired(true).setMaxLength(128)))
  .addSubcommand((sub) => sub.setName("summary").setDescription("Summarize your last 30 days of activity"))
  .addSubcommand((sub) => sub.setName("deposits").setDescription("Show your latest confirmed deposits"))
  .addSubcommand((sub) => sub.setName("withdrawals").setDescription("Show your latest withdrawals"))
  .addSubcommand((sub) => sub.setName("tips").setDescription("Show your latest sent and received tips"));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await userRepo.findOrCreateUser(interaction.user.id);
  const action = interaction.options.getSubcommand();
  if (action === "lookup") {
    const hash = interaction.options.getString("hash", true).trim();
    const transaction = await prisma.transaction.findFirst({
      where: { txHash: hash, OR: [{ senderId: user.id }, { receiverId: user.id }] },
    });
    if (!transaction) {
      await interaction.reply({ embeds: [errorEmbed("No transaction with that hash is associated with your account.")], ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [brandEmbed().setTitle("Your transaction").addFields(
      { name: "Type", value: transaction.type, inline: true },
      { name: "Asset", value: `${transaction.tokenSymbol} · ${transaction.chain}`, inline: true },
      { name: "Status", value: transaction.status, inline: true },
      { name: "Amount", value: formatTransactionAmount(transaction), inline: true },
      { name: "Created", value: `<t:${Math.floor(transaction.createdAt.getTime() / 1000)}:F>`, inline: false },
      ...(transaction.txHash ? [{ name: "Transaction hash", value: `\`${transaction.txHash}\``, inline: false }] : []),
    )], ephemeral: true });
    return;
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (action === "summary") {
    const records = await prisma.transaction.findMany({
      where: { OR: [{ senderId: user.id }, { receiverId: user.id }], createdAt: { gte: since } },
      select: { type: true, status: true },
    });
    const counts = new Map<string, number>();
    for (const record of records) counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
    const description = [...counts.entries()].map(([type, count]) => `**${type}:** ${count}`).join("\n") || "No activity in the last 30 days.";
    await interaction.reply({ embeds: [brandEmbed().setTitle("30-day activity").setDescription(description).addFields(
      { name: "Total records", value: String(records.length), inline: true },
      { name: "Pending/failed", value: String(records.filter((r: any) => r.status !== "completed").length), inline: true },
    )], ephemeral: true });
    return;
  }
  const limit = interaction.options.getInteger("limit") ?? 10;
  const typeFilter = action === "deposits" ? "deposit" : action === "withdrawals" ? "withdraw" : action === "tips" ? "tip" : undefined;
  const records = await prisma.transaction.findMany({
    where: {
      OR: [{ senderId: user.id }, { receiverId: user.id }],
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const description = records.map((record: any) => {
    const direction = record.senderId === user.id ? "Sent" : "Received";
    const amount = formatTransactionAmount(record);
    const hash = record.txHash ? ` · \`${record.txHash.slice(0, 12)}…\`` : "";
    return `• **${direction} ${record.type}** ${amount} ${record.tokenSymbol} · ${record.chain} · <t:${Math.floor(record.createdAt.getTime() / 1000)}:R>${hash}`;
  }).join("\n") || "No transactions recorded yet.";
  await interaction.reply({ embeds: [brandEmbed().setTitle("Recent transactions").setDescription(description)], ephemeral: true });
}

export default { data, execute } satisfies BotCommand;
