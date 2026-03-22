import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getPrice } from "../../core/price.service.js";
import { brandEmbed, errorEmbed } from "../components/embeds.js";
import { formatUsd } from "../../utils/format.js";
import { EMOJIS } from "../../utils/constants.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("price")
  .setDescription("Check current token price")
  .addStringOption((opt) =>
    opt.setName("token").setDescription("Token symbol (e.g. ETH, SOL, USDC)").setRequired(true),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const symbol = interaction.options.getString("token", true).toUpperCase();
  const info = await getPrice(symbol);

  if (!info) {
    await interaction.editReply({
      embeds: [errorEmbed(`Price data not available for **${symbol}**`)],
    });
    return;
  }

  const changeEmoji = info.change24h >= 0 ? "📈" : "📉";
  const changeColor = info.change24h >= 0 ? 0x00ff88 : 0xff4444;
  const changeStr = `${info.change24h >= 0 ? "+" : ""}${info.change24h.toFixed(2)}%`;

  const embed = brandEmbed()
    .setColor(changeColor)
    .setTitle(`${EMOJIS.price} ${symbol} Price`)
    .addFields(
      { name: "Price", value: formatUsd(info.price), inline: true },
      { name: `${changeEmoji} 24h Change`, value: changeStr, inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute } satisfies BotCommand;
