import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { ethers } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { getAllWallets, getOrCreateWallet } from "../../core/wallet.service.js";
import { withdraw } from "../../core/withdraw.service.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { findToken } from "../../blockchain/tokens.js";
import { parseTokenAmount } from "../../utils/format.js";
import { isLitecoinAddress, isLitecoinConfigured } from "../../blockchain/litecoin.js";
import { walletEmbed, withdrawEmbed, brandEmbed, errorEmbed } from "../components/embeds.js";
import { EMOJIS } from "../../utils/constants.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("wallet")
  .setDescription("Manage your Crypto wallets")
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
  )
  .addSubcommand((sub) =>
    sub
      .setName("withdraw")
      .setDescription("Withdraw tokens to an external address")
      .addStringOption((opt) =>
        opt
          .setName("chain")
          .setDescription("The blockchain")
          .setRequired(true)
          .addChoices(...CHAIN_IDS.map((c) => ({ name: getChain(c).name, value: c }))),
      )
      .addStringOption((opt) =>
        opt.setName("address").setDescription("Destination address").setRequired(true),
      )
      .addNumberOption((opt) =>
        opt
          .setName("amount")
          .setDescription("Amount to withdraw")
          .setRequired(true)
          .setMinValue(0.000001),
      )
      .addStringOption((opt) =>
        opt
          .setName("token")
          .setDescription("Token symbol (e.g. ETH, USDC)")
          .setRequired(true),
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
    return;
  }

  if (sub === "deposit") {
    const chainId = interaction.options.getString("chain", true);
    if (chainId === "litecoin" && !isLitecoinConfigured()) {
      await interaction.editReply({ embeds: [errorEmbed("Litecoin deposits are disabled until the operator sets LITECOIN_API_TOKEN.")] });
      return;
    }
    const { address } = await getOrCreateWallet(interaction.user.id, chainId, isTestnet);
    const embed = walletEmbed({ chain: chainId, address, isTestnet });
    embed.setDescription(
      `Send ${getChain(chainId).nativeToken} or tokens to this address to deposit.`,
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === "withdraw") {
    const chainId = interaction.options.getString("chain", true);
    const toAddress = interaction.options.getString("address", true);
    const amount = interaction.options.getNumber("amount", true);
    const tokenSymbol = interaction.options.getString("token", true).toUpperCase();
    const chain = getChain(chainId);
    if (chain.type === "litecoin" && !isLitecoinConfigured()) {
      await interaction.editReply({ embeds: [errorEmbed("Litecoin withdrawals are disabled until the operator sets LITECOIN_API_TOKEN.")] });
      return;
    }

    if (chain.type === "solana") {
      try {
        new PublicKey(toAddress);
      } catch {
        await interaction.editReply({ embeds: [errorEmbed("Invalid Solana address")] });
        return;
      }
    } else if (chain.type === "litecoin") {
      if (!isLitecoinAddress(toAddress, isTestnet)) {
        await interaction.editReply({ embeds: [errorEmbed("Invalid Litecoin address for the selected network")] });
        return;
      }
    } else if (!ethers.isAddress(toAddress)) {
      await interaction.editReply({ embeds: [errorEmbed("Invalid EVM address")] });
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
    const result = await withdraw(
      interaction.user.id,
      toAddress,
      rawAmount,
      tokenSymbol,
      chainId,
      token,
      decimals,
      isTestnet,
    );

    if (!result.success) {
      await interaction.editReply({ embeds: [errorEmbed(result.error!)] });
      return;
    }

    await interaction.editReply({
      embeds: [
        withdrawEmbed({
          chainId,
          txHash: result.txHash!,
          amount: rawAmount,
          decimals,
          tokenSymbol,
          toAddress,
          isTestnet,
          networkFee: result.networkFee,
        }),
      ],
    });
  }
}

export default { data, execute } satisfies BotCommand;
