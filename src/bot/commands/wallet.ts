import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getAllWallets, getOrCreateWallet } from "../../core/wallet.service.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { walletEmbed, brandEmbed, errorEmbed } from "../components/embeds.js";
import { EMOJIS } from "../../utils/constants.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("wallet")
  .setDescription("Manage your Hodlr wallets")
  .addSubcommand((sub) =>
    sub.setName("view").setDescription("View all your wallet addresses"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("deposit")
      .setDescription("Get your deposit address for a chain")
      .addStringOption((opt) =>
        opt
          .setName("chain")
          .setDescription("The blockchain")
          .setRequired(true)
          .addChoices(...CHAIN_IDS.map((c) => ({ name: getChain(c).name, value: c }))),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const sub = interaction.options.getSubcommand();

  if (sub === "view") {
    const wallets = await getAllWallets(interaction.user.id, isTestnet);
    const embed = brandEmbed()
      .setTitle(`${EMOJIS.wallet} Your Wallets`)
      .setDescription(
        `Network: ${isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`}`,
      );

    for (const w of wallets) {
      const chain = getChain(w.chain);
      embed.addFields({
        name: `${chain.emoji} ${chain.name}`,
        value: `\`${w.address}\``,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } else if (sub === "deposit") {
    const chainId = interaction.options.getString("chain", true);
    const { address } = await getOrCreateWallet(
      interaction.user.id,
      chainId,
      isTestnet,
    );
    const embed = walletEmbed({ chain: chainId, address, isTestnet });
    embed.setDescription(
      `Send ${getChain(chainId).nativeToken} or tokens to this address to deposit.`,
    );
    await interaction.editReply({ embeds: [embed] });
  }
}

export default { data, execute } satisfies BotCommand;
