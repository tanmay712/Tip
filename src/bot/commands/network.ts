import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { successEmbed, brandEmbed } from "../components/embeds.js";
import { EMOJIS } from "../../utils/constants.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("network")
  .setDescription("Switch between mainnet and testnet")
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("Network to switch to")
      .addChoices(
        { name: "Mainnet", value: "mainnet" },
        { name: "Testnet", value: "testnet" },
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const mode = interaction.options.getString("mode") as
    | "mainnet"
    | "testnet"
    | null;

  if (!mode) {
    const current = await userRepo.getUserNetwork(interaction.user.id);
    const emoji = current === "testnet" ? EMOJIS.testnet : EMOJIS.mainnet;
    await interaction.editReply({
      embeds: [
        brandEmbed()
          .setTitle(`${EMOJIS.network} Current Network`)
          .setDescription(`You're on **${emoji} ${current}**`),
      ],
    });
    return;
  }

  await userRepo.findOrCreateUser(interaction.user.id);
  await userRepo.setUserNetwork(interaction.user.id, mode);

  const emoji = mode === "testnet" ? EMOJIS.testnet : EMOJIS.mainnet;
  await interaction.editReply({
    embeds: [
      successEmbed(
        "Network Switched",
        `Now using **${emoji} ${mode}**. All commands will use ${mode} endpoints.`,
      ),
    ],
  });
}

export default { data, execute } satisfies BotCommand;
