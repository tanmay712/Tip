import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { config } from "../../config.js";
import { prisma } from "../../database/client.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as configRepo from "../../database/repositories/config.repo.js";
import { brandEmbed, errorEmbed, successEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";
import { logSecurityEvent } from "../../utils/security.js";

const data = new SlashCommandBuilder()
  .setName("owner")
  .setDescription("Crypto operator controls (owner allowlist only)")
  .addSubcommand((sub) => sub.setName("stats").setDescription("View operational counts"))
  .addSubcommand((sub) => sub.setName("user-lookup").setDescription("Inspect a user account without exposing keys")
    .addUserOption((option) => option.setName("user").setDescription("Discord user").setRequired(true)))
  .addSubcommand((sub) => sub.setName("user-ban").setDescription("Disable a Crypto account")
    .addUserOption((option) => option.setName("user").setDescription("Discord user").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Audit reason").setRequired(true).setMaxLength(300)))
  .addSubcommand((sub) => sub.setName("user-unban").setDescription("Restore a Crypto account")
    .addUserOption((option) => option.setName("user").setDescription("Discord user").setRequired(true)));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!config.dashboard.ownerDiscordIds.includes(interaction.user.id)) {
    await interaction.reply({ embeds: [errorEmbed("This command is restricted to configured Crypto owners.")], ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "stats") {
    const [users, wallets, transactions, banned] = await Promise.all([
      prisma.user.count(), prisma.wallet.count(), prisma.transaction.count(), prisma.bannedUser.count(),
    ]);
    await interaction.editReply({ embeds: [brandEmbed().setTitle("Crypto operator status").addFields(
      { name: "Users", value: String(users), inline: true },
      { name: "Wallets", value: String(wallets), inline: true },
      { name: "Transactions", value: String(transactions), inline: true },
      { name: "Banned", value: String(banned), inline: true },
    )] });
    return;
  }
  const target = interaction.options.getUser("user", true);
  if (subcommand === "user-lookup") {
    const user = await userRepo.getUser(target.id);
    const ban = await configRepo.getBannedUser(target.id);
    await interaction.editReply({ embeds: [brandEmbed().setTitle("Account lookup")
      .setDescription(user ? `Discord ID: \`${target.id}\`\nCreated: <t:${Math.floor(user.createdAt.getTime() / 1000)}:R>\nConsent current: ${await userRepo.hasCurrentConsent(target.id) ? "yes" : "no"}\nWallet records: ${user.wallets.length}\nAccount banned: ${ban ? "yes" : "no"}` : `No Crypto account exists for ${target.tag} (\`${target.id}\`).`)] });
    return;
  }
  if (subcommand === "user-ban") {
    const reason = interaction.options.getString("reason", true);
    await configRepo.banUser(target.id, interaction.user.id, reason);
    logSecurityEvent({ type: "USER_BANNED", discordId: target.id, extra: { bannedBy: interaction.user.id, reason } });
    await interaction.editReply({ embeds: [successEmbed("Account disabled", `Crypto access disabled for \`${target.id}\`. Reason recorded.`)] });
    return;
  }
  if (subcommand === "user-unban") {
    await configRepo.unbanUser(target.id);
    logSecurityEvent({ type: "USER_UNBANNED", discordId: target.id, extra: { unbannedBy: interaction.user.id } });
    await interaction.editReply({ embeds: [successEmbed("Account restored", `Crypto access restored for \`${target.id}\` (if it was banned).`)] });
  }
}

export default { data, execute } satisfies BotCommand;
