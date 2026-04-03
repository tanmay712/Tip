import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { sendRain } from "../../core/rain.service.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { findToken } from "../../blockchain/tokens.js";
import { parseTokenAmount } from "../../utils/format.js";
import { rainEmbed, errorEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("rain")
  .setDescription("Distribute crypto to recent active users")
  .addNumberOption((opt) =>
    opt.setName("amount").setDescription("Total amount to distribute").setRequired(true).setMinValue(0.000001),
  )
  .addStringOption((opt) =>
    opt.setName("token").setDescription("Token symbol (e.g. ETH, USDC)").setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("chain")
      .setDescription("Blockchain (defaults to ethereum)")
      .addChoices(...CHAIN_IDS.map((c) => ({ name: getChain(c).name, value: c }))),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const amount = interaction.options.getNumber("amount", true);
  const tokenSymbol = interaction.options.getString("token", true).toUpperCase();
  const chainId = interaction.options.getString("chain") || "ethereum";
  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const chain = getChain(chainId);

  let token = "native";
  let decimals = chain.nativeDecimals;
  if (tokenSymbol !== chain.nativeToken) {
    const tokenInfo = findToken(tokenSymbol, chainId);
    if (!tokenInfo) {
      await interaction.editReply({
        embeds: [errorEmbed(`Token ${tokenSymbol} not found on ${chain.name}`)],
      });
      return;
    }
    token = tokenInfo.contractAddress;
    decimals = tokenInfo.decimals;
  }

  // Get recent active members (fetched from guild members)
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ embeds: [errorEmbed("This command can only be used in servers")] });
    return;
  }

  const members = await guild.members.fetch({ limit: 100 });
  const eligible = members
    .filter(
      (m: GuildMember) =>
        !m.user.bot && m.user.id !== interaction.user.id,
    )
    .map((m: GuildMember) => m.user.id)
    .slice(0, 50);

  if (eligible.length === 0) {
    await interaction.editReply({ embeds: [errorEmbed("No eligible recipients")] });
    return;
  }

  const rawAmount = parseTokenAmount(amount.toString(), decimals).toString();
  const result = await sendRain(
    interaction.user.id,
    eligible,
    rawAmount,
    tokenSymbol,
    chainId,
    token,
    isTestnet,
  );

  if (!result.success) {
    await interaction.editReply({ embeds: [errorEmbed(result.error!)] });
    return;
  }

  await interaction.editReply({
    embeds: [
      rainEmbed({
        senderTag: interaction.user.displayName,
        totalAmount: result.totalAmount,
        perUser: result.perUser,
        decimals,
        tokenSymbol,
        recipients: result.recipients,
        chainId,
        isTestnet,
      }),
    ],
  });
}

export default { data, execute } satisfies BotCommand;
