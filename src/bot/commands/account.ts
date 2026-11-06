import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { config } from "../../config.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { brandEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("account")
  .setDescription("Manage your Crypto account and recovery setup")
  .addSubcommand((sub) => sub.setName("status").setDescription("View consent, network, and recovery status"))
  .addSubcommand((sub) => sub.setName("dashboard").setDescription("Open the authenticated account dashboard"))
  .addSubcommand((sub) => sub.setName("privacy").setDescription("View privacy policy and terms links"));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await userRepo.findOrCreateUser(interaction.user.id);
  const action = interaction.options.getSubcommand();
  if (action === "status") {
    const network = await userRepo.getUserNetwork(interaction.user.id);
    const consent = await userRepo.hasCurrentConsent(interaction.user.id);
    await interaction.reply({ embeds: [brandEmbed().setTitle("Account status").addFields(
      { name: "Network", value: network, inline: true },
      { name: "Consent", value: consent ? `Accepted (${config.dashboard.termsVersion})` : "Not accepted", inline: true },
      { name: "Recovery key", value: user.recoveryKeyHash ? "Created — stored as a one-way verification hash" : "Not created", inline: false },
    )], ephemeral: true });
    return;
  }
  const base = config.dashboard.baseUrl;
  if (!base) {
    await interaction.reply({ content: "The dashboard isn't configured yet. The operator must set APP_BASE_URL.", ephemeral: true });
    return;
  }
  if (action === "dashboard") {
    await interaction.reply({ content: `Sign in to the Crypto dashboard with Discord (identify only): ${base}/auth/discord\nAfter signing in, create your one-time recovery key and download an encrypted backup.`, ephemeral: true });
  } else {
    await interaction.reply({ content: `Privacy Policy: ${base}/privacy\nTerms of Service: ${base}/terms`, ephemeral: true });
  }
}

export default { data, execute } satisfies BotCommand;
