import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as configRepo from "../../database/repositories/config.repo.js";
import { brandEmbed, errorEmbed, successEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("server")
  .setDescription("Configure Crypto for this Discord server")
  .addSubcommand((sub) => sub.setName("status").setDescription("View Crypto server settings"))
  .addSubcommand((sub) => sub.setName("log-channel-set").setDescription("Set the Crypto audit log channel")
    .addChannelOption((option) => option.setName("channel").setDescription("Text channel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((sub) => sub.setName("log-channel-clear").setDescription("Disable server audit logging"))
  .addSubcommand((sub) => sub.setName("admin-role-set").setDescription("Set the optional Crypto admin role")
    .addRoleOption((option) => option.setName("role").setDescription("Role allowed to administer Crypto server settings").setRequired(true)));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [errorEmbed("Server settings are available in a server only.")], ephemeral: true });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ embeds: [errorEmbed("You need Manage Server permission to change Crypto server settings.")], ephemeral: true });
    return;
  }
  const action = interaction.options.getSubcommand();
  if (action === "status") {
    const settings = await configRepo.getGuildConfig(interaction.guildId);
    await interaction.reply({ embeds: [brandEmbed().setTitle("Crypto server settings").addFields(
      { name: "Audit channel", value: settings?.logChannelId ? `<#${settings.logChannelId}>` : "Not set", inline: true },
      { name: "Admin role", value: settings?.adminRoleId ? `<@&${settings.adminRoleId}>` : "Manage Server permission only", inline: true },
    )], ephemeral: true });
  } else if (action === "log-channel-set") {
    const channel = interaction.options.getChannel("channel", true);
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type as ChannelType)) {
      await interaction.reply({ embeds: [errorEmbed("Choose a text channel that Crypto can send to.")], ephemeral: true });
      return;
    }
    await configRepo.setLogChannel(interaction.guildId, channel.id);
    await interaction.reply({ embeds: [successEmbed("Audit channel updated", `Crypto logs will be sent to <#${channel.id}> when configured event logging runs.`)], ephemeral: true });
  } else if (action === "log-channel-clear") {
    await configRepo.setLogChannel(interaction.guildId, null);
    await interaction.reply({ embeds: [successEmbed("Audit logging disabled", "Crypto will stop sending logs to this server channel.")], ephemeral: true });
  } else {
    const role = interaction.options.getRole("role", true);
    await configRepo.setAdminRole(interaction.guildId, role.id);
    await interaction.reply({ embeds: [successEmbed("Admin role updated", `Crypto server administration can now also be performed by <@&${role.id}>.`)], ephemeral: true });
  }
}

export default { data, execute } satisfies BotCommand;
