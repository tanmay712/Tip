import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { sendTip } from "../../core/tip.service.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { findToken } from "../../blockchain/tokens.js";
import { parseTokenAmount } from "../../utils/format.js";
import { tipEmbed, errorEmbed } from "../components/embeds.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("tip")
  .setDescription("Send a crypto tip to another user")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Who to tip").setRequired(true),
  )
  .addNumberOption((opt) =>
    opt.setName("amount").setDescription("Amount to send").setRequired(true).setMinValue(0.000001),
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

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getNumber("amount", true);
  const tokenSymbol = interaction.options.getString("token", true).toUpperCase();
  const chainId = interaction.options.getString("chain") || "ethereum";

  if (target.id === interaction.user.id) {
    await interaction.editReply({ embeds: [errorEmbed("You can't tip yourself!")] });
    return;
  }
  if (target.bot) {
    await interaction.editReply({ embeds: [errorEmbed("You can't tip bots!")] });
    return;
  }

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

  const rawAmount = parseTokenAmount(amount.toString(), decimals).toString();
  const result = await sendTip(
    interaction.user.id,
    target.id,
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
      tipEmbed({
        senderTag: interaction.user.displayName,
        receiverTag: target.displayName,
        amount: rawAmount,
        decimals,
        tokenSymbol,
        chainId,
        isTestnet,
      }),
    ],
  });

  // DM the recipient
  try {
    await target.send({
      embeds: [
        tipEmbed({
          senderTag: interaction.user.displayName,
          receiverTag: "you",
          amount: rawAmount,
          decimals,
          tokenSymbol,
          chainId,
          isTestnet,
        }).setFooter({ text: "Use /balance to check your balance" }),
      ],
    });
  } catch {
    // User has DMs disabled
  }
}

export default { data, execute } satisfies BotCommand;
