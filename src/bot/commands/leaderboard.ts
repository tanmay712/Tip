import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { getLeaderboard } from "../../core/leaderboard.service.js";
import { brandEmbed } from "../components/embeds.js";
import { EMOJIS } from "../../utils/constants.js";
import type { BotCommand } from "../client.js";

const MEDALS = ["🥇", "🥈", "🥉"];

const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("See the top tippers")
  .addIntegerOption((opt) =>
    opt.setName("limit").setDescription("How many to show (default 10)").setMinValue(1).setMaxValue(25),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const limit = interaction.options.getInteger("limit") || 10;

  const entries = await getLeaderboard(isTestnet, limit);

  if (entries.length === 0) {
    await interaction.editReply({
      embeds: [
        brandEmbed()
          .setTitle(`${EMOJIS.leaderboard} Leaderboard`)
          .setDescription("No tips recorded yet. Be the first!"),
      ],
    });
    return;
  }

  const lines = entries.map((e) => {
    const medal = MEDALS[e.rank - 1] || `**#${e.rank}**`;
    return `${medal} <@${e.discordId}> — **${e.totalTips}** tips sent`;
  });

  const embed = brandEmbed()
    .setTitle(`${EMOJIS.leaderboard} Top Tippers`)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`,
    });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute } satisfies BotCommand;
