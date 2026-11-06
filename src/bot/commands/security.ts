import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { config } from "../../config.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { brandEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("security")
  .setDescription("Review Crypto account-security and recovery controls")
  .addSubcommand((sub) => sub.setName("status").setDescription("Review recovery-key and consent status"))
  .addSubcommand((sub) => sub.setName("dashboard").setDescription("Open authenticated recovery and security tools"))
  .addSubcommand((sub) => sub.setName("backup-guide").setDescription("Read safe backup and local recovery instructions"))
  .addSubcommand((sub) => sub.setName("privacy").setDescription("Open the Crypto privacy and terms pages"));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getSubcommand();
  const base = config.dashboard.baseUrl;
  if (action === "status") {
    const user = await userRepo.findOrCreateUser(interaction.user.id);
    await interaction.reply({ embeds: [brandEmbed().setTitle("Security status").addFields(
      { name: "Consent", value: await userRepo.hasCurrentConsent(interaction.user.id) ? "Current" : "Needs acceptance", inline: true },
      { name: "Recovery key", value: user.recoveryKeyHash ? "Issued; cannot be shown again" : "Not issued", inline: true },
      { name: "Discord OAuth", value: "identify scope only; no guild, email, or message access", inline: false },
    )], ephemeral: true });
    return;
  }
  if (!base) {
    await interaction.reply({ content: "Dashboard links are disabled until APP_BASE_URL is configured.", ephemeral: true });
    return;
  }
  if (action === "privacy") {
    await interaction.reply({ content: `Privacy Policy: ${base}/privacy\nTerms of Service: ${base}/terms`, ephemeral: true });
  } else if (action === "backup-guide") {
    await interaction.reply({ content: `Sign in with Discord to create a one-time recovery key and encrypted backup: ${base}/auth/discord\n\nTo open a backup, use the local browser decryptor at ${base}/recover. The key and backup are both required; store them separately. Never share either with support.`, ephemeral: true });
  } else {
    await interaction.reply({ content: `Open the authenticated dashboard: ${base}/auth/discord\nDiscord authorization uses identify only.`, ephemeral: true });
  }
}

export default { data, execute } satisfies BotCommand;
