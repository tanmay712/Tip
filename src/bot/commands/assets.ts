import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { findToken, getTokensForChain } from "../../blockchain/tokens.js";
import { getPrices } from "../../core/price.service.js";
import { isLitecoinConfigured } from "../../blockchain/litecoin.js";
import { brandEmbed, errorEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("assets")
  .setDescription("Inspect supported Crypto chains and tokens")
  .addSubcommand((sub) => sub.setName("list").setDescription("List supported native assets and tokens")
    .addStringOption((option) => option.setName("chain").setDescription("Filter by chain")
      .addChoices(...CHAIN_IDS.map((id) => ({ name: getChain(id).name, value: id }))))
  )
  .addSubcommand((sub) => sub.setName("lookup").setDescription("Look up a configured token contract")
    .addStringOption((option) => option.setName("chain").setDescription("Chain").setRequired(true)
      .addChoices(...CHAIN_IDS.map((id) => ({ name: getChain(id).name, value: id }))))
    .addStringOption((option) => option.setName("symbol").setDescription("Token symbol").setRequired(true).setMaxLength(16)))
  .addSubcommand((sub) => sub.setName("native-prices").setDescription("Show USD prices for supported native assets"));

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const action = interaction.options.getSubcommand();
  if (action === "lookup") {
    const chainId = interaction.options.getString("chain", true);
    const symbol = interaction.options.getString("symbol", true);
    const token = findToken(symbol, chainId);
    if (!token) {
      await interaction.reply({ embeds: [errorEmbed(`No ${symbol.toUpperCase()} contract is configured for ${getChain(chainId).name}.`)], ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [brandEmbed().setTitle(`${token.name} (${token.symbol})`).addFields(
      { name: "Chain", value: getChain(chainId).name, inline: true },
      { name: "Decimals", value: String(token.decimals), inline: true },
      { name: "Contract", value: `\`${token.contractAddress}\``, inline: false },
    )], ephemeral: true });
    return;
  }
  if (action === "native-prices") {
    const symbols = [...new Set(CHAIN_IDS.map((id) => getChain(id).nativeToken))];
    const prices = await getPrices(symbols);
    const description = symbols.map((symbol) => {
      const price = prices.get(symbol);
      return price ? `**${symbol}** $${price.price.toLocaleString("en-US", { maximumFractionDigits: 6 })} (${price.change24h >= 0 ? "+" : ""}${price.change24h.toFixed(2)}% 24h)` : `**${symbol}** Price unavailable`;
    }).join("\n");
    await interaction.reply({ embeds: [brandEmbed().setTitle("Native asset prices").setDescription(description)], ephemeral: true });
    return;
  }
  const filter = interaction.options.getString("chain");
  const chainIds = filter ? [filter] : CHAIN_IDS;
  const description = chainIds.map((id) => {
    const chain = getChain(id);
    const tokens = getTokensForChain(id).map((token) => token.symbol);
    return `**${chain.name}** — ${chain.nativeToken}${tokens.length ? ` · ${[...new Set(tokens)].join(", ")}` : ""}`;
  }).join("\n");
  const providerNotice = !isLitecoinConfigured() && chainIds.includes("litecoin")
    ? "\n\n⚠️ Litecoin on-chain operations are disabled until the operator configures `LITECOIN_API_TOKEN`."
    : "";
  await interaction.reply({ embeds: [brandEmbed().setTitle("Supported assets").setDescription(description + providerNotice)], ephemeral: true });
}

export default { data, execute } satisfies BotCommand;
