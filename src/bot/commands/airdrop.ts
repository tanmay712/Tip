import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  ComponentType,
} from "discord.js";
import { createAirdrop, claimAirdrop } from "../../core/airdrop.service.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as airdropRepo from "../../database/repositories/airdrop.repo.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { findToken } from "../../blockchain/tokens.js";
import { parseTokenAmount, formatTokenAmount } from "../../utils/format.js";
import { airdropEmbed, errorEmbed, successEmbed } from "../components/embeds.js";
import { airdropClaimButton } from "../components/buttons.js";
import { withComponentsV2 } from "../components/v2.js";
import { EMOJIS, LIMITS } from "../../utils/constants.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("airdrop")
  .setDescription("Create a claimable airdrop")
  .addNumberOption((opt) =>
    opt.setName("amount").setDescription("Total amount to airdrop").setRequired(true).setMinValue(0.000001),
  )
  .addStringOption((opt) =>
    opt.setName("token").setDescription("Token symbol").setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("slots")
      .setDescription("Number of claim slots")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(LIMITS.maxAirdropSlots),
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
  const slots = interaction.options.getInteger("slots", true);
  const chainId = interaction.options.getString("chain") || "ethereum";
  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const chain = getChain(chainId);

  if (!interaction.guild) {
    await interaction.editReply({ embeds: [errorEmbed("Use this in a server")] });
    return;
  }

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
  const result = await createAirdrop(
    interaction.user.id,
    interaction.guild.id,
    interaction.channel!.id,
    rawAmount,
    tokenSymbol,
    chainId,
    token,
    slots,
    isTestnet,
  );

  if (!result.success) {
    await interaction.editReply({ embeds: [errorEmbed(result.error!)] });
    return;
  }

  const reservedTotalAmount = result.totalAmount;

  const expiresAt = new Date(Date.now() + LIMITS.airdropExpiryMinutes * 60 * 1000);

  const msg = await interaction.editReply({
    embeds: [
      airdropEmbed({
        creatorTag: interaction.user.displayName,
        totalAmount: reservedTotalAmount,
        perClaim: result.perClaim,
        decimals,
        tokenSymbol,
        maxClaims: result.maxClaims,
        currentClaims: 0,
        chainId,
        isTestnet,
        expiresAt,
      }),
    ],
    components: [airdropClaimButton(result.airdropId!)],
  });

  await airdropRepo.updateAirdropMessage(result.airdropId!, msg.id);

  // Handle claim button interactions
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: LIMITS.airdropExpiryMinutes * 60 * 1000,
  });

  collector.on("collect", async (btnInteraction: ButtonInteraction) => {
    if (!btnInteraction.customId.startsWith("airdrop_claim:")) return;
    await withComponentsV2(btnInteraction, () => withComponentsV2(interaction, async () => {

    await btnInteraction.deferReply({ ephemeral: true });

    const claimResult = await claimAirdrop(
      result.airdropId!,
      btnInteraction.user.id,
      isTestnet,
    );

    if (!claimResult.success) {
      await btnInteraction.editReply({
        embeds: [errorEmbed(claimResult.error!)],
      });
      return;
    }

    await btnInteraction.editReply({
      embeds: [
        successEmbed(
          "Airdrop Claimed!",
          `You received **${formatTokenAmount(claimResult.amount!, decimals)} ${tokenSymbol}**`,
        ),
      ],
    });

    // Update the airdrop embed with new claim count
    const airdrop = await airdropRepo.getAirdrop(result.airdropId!);
    if (airdrop) {
      const claimCount = airdrop.claims.length;
      await interaction.editReply({
        embeds: [
          airdropEmbed({
            creatorTag: interaction.user.displayName,
            totalAmount: reservedTotalAmount,
            perClaim: result.perClaim,
            decimals,
            tokenSymbol,
            maxClaims: result.maxClaims,
            currentClaims: claimCount,
            chainId,
            isTestnet,
            expiresAt,
          }),
        ],
        components:
          claimCount >= result.maxClaims ? [] : [airdropClaimButton(result.airdropId!)],
      });
    }
    }));
  });

  collector.on("end", async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch {
      // Message may have been deleted
    }
  });
}

export default { data, execute } satisfies BotCommand;
