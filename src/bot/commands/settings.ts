import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { brandEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("Configure your Crypto account preferences")
  .addSubcommand((sub) => sub.setName("status").setDescription("View your current preferences"))
  .addSubcommand((sub) => sub.setName("notifications-on").setDescription("Enable Crypto direct-message notifications"))
  .addSubcommand((sub) => sub.setName("notifications-off").setDescription("Disable optional Crypto direct-message notifications"))
  .addSubcommand((sub) => sub.setName("mainnet").setDescription("Set your default network to mainnet"))
  .addSubcommand((sub) => sub.setName("testnet").setDescription("Set your default network to testnet"));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getSubcommand();
  if (action === "notifications-on" || action === "notifications-off") {
    const enabled = action.endsWith("on");
    await userRepo.setDmEnabled(interaction.user.id, enabled);
    await interaction.reply({ content: `Optional Crypto DMs are now ${enabled ? "on" : "off"}.`, ephemeral: true });
    return;
  }
  if (action === "mainnet" || action === "testnet") {
    await userRepo.setUserNetwork(interaction.user.id, action);
    await interaction.reply({ content: `Your default network is now ${action}. Always verify the chain and destination before sending funds.`, ephemeral: true });
    return;
  }
  const network = await userRepo.getUserNetwork(interaction.user.id);
  const notifications = await userRepo.isDmEnabled(interaction.user.id);
  await interaction.reply({ embeds: [brandEmbed().setTitle("Your Crypto settings").addFields(
    { name: "Default network", value: network, inline: true },
    { name: "Optional DMs", value: notifications ? "Enabled" : "Disabled", inline: true },
  )], ephemeral: true });
}

export default { data, execute } satisfies BotCommand;
