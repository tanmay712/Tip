import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { brandEmbed } from "../components/embeds.js";
import { BRAND, EMOJIS } from "../../utils/constants.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Learn how to use Hodlr")
  .addStringOption((opt) =>
    opt
      .setName("command")
      .setDescription("Get help for a specific command")
      .addChoices(
        { name: "wallet", value: "wallet" },
        { name: "tip", value: "tip" },
        { name: "rain", value: "rain" },
        { name: "airdrop", value: "airdrop" },
        { name: "balance", value: "balance" },
        { name: "history", value: "history" },
        { name: "leaderboard", value: "leaderboard" },
        { name: "price", value: "price" },
        { name: "network", value: "network" },
      ),
  );

const COMMAND_HELP: Record<string, { usage: string; description: string }> = {
  wallet: {
    usage: "/wallet view | /wallet deposit <chain> | /wallet withdraw <chain> <address> <amount> <token>",
    description:
      "View wallets, get a deposit address, or withdraw tokens to an external address.",
  },
  tip: {
    usage: "/tip <user> <amount> <token> [chain]",
    description:
      "Send an instant off-chain tip. No gas, no fees. Example: `/tip @alice 0.01 ETH`",
  },
  rain: {
    usage: "/rain <amount> <token> [chain]",
    description:
      "Distribute tokens evenly among recent active members in the server.",
  },
  airdrop: {
    usage: "/airdrop <amount> <token> <slots> [chain]",
    description:
      "Create a first-come-first-served airdrop. Users click a button to claim. Expires after 1 hour.",
  },
  balance: {
    usage: "/balance [chain]",
    description:
      "Check your balances. Shows on-chain and internal (from tips) balances. Specify a chain for detail.",
  },
  history: {
    usage: "/history [type] [page]",
    description:
      "View your transaction history. Filter by: tips, rain, airdrops, deposits, withdrawals.",
  },
  leaderboard: {
    usage: "/leaderboard [limit]",
    description: "See the top tippers ranked by total tips sent.",
  },
  price: {
    usage: "/price <token>",
    description: "Check the current USD price and 24h change for any supported token.",
  },
  network: {
    usage: "/network [mainnet|testnet]",
    description:
      "Switch between mainnet and testnet. Use testnet to try things out risk-free.",
  },
};

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const specificCmd = interaction.options.getString("command");

  if (specificCmd && COMMAND_HELP[specificCmd]) {
    const help = COMMAND_HELP[specificCmd];
    await interaction.reply({
      embeds: [
        brandEmbed()
          .setTitle(`/${specificCmd}`)
          .addFields(
            { name: "Usage", value: `\`${help.usage}\``, inline: false },
            { name: "Description", value: help.description, inline: false },
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  const chainList = CHAIN_IDS.map((c) => {
    const ch = getChain(c);
    return `${ch.emoji} ${ch.name} (${ch.nativeToken})`;
  }).join("\n");

  const embed = brandEmbed()
    .setTitle(`${BRAND.name} — ${BRAND.tagline}`)
    .setDescription("A modern crypto tipping bot supporting 8 chains, testnet & mainnet.")
    .addFields(
      {
        name: `${EMOJIS.tip} Tipping`,
        value: "`/tip` `/rain` `/airdrop`",
        inline: true,
      },
      {
        name: `${EMOJIS.wallet} Wallet`,
        value: "`/wallet` `/balance`",
        inline: true,
      },
      {
        name: `${EMOJIS.history} Info`,
        value: "`/history` `/leaderboard` `/price`",
        inline: true,
      },
      {
        name: `${EMOJIS.network} Settings`,
        value: "`/network` `/help`",
        inline: true,
      },
      {
        name: "Supported Chains",
        value: chainList,
        inline: false,
      },
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export default { data, execute } satisfies BotCommand;
