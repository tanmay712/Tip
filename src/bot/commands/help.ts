import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { brandEmbed } from "../components/embeds.js";
import { BRAND, EMOJIS } from "../../utils/constants.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import type { BotCommand } from "../client.js";

const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Learn how to use Crypto")
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
        { name: "account", value: "account" },
        { name: "owner", value: "owner" },
        { name: "settings", value: "settings" },
        { name: "server", value: "server" },
        { name: "transactions", value: "transactions" },
        { name: "assets", value: "assets" },
        { name: "security", value: "security" },
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
  account: {
    usage: "/account status|dashboard|privacy",
    description: "Review your consent and recovery setup, or open the authenticated dashboard.",
  },
  owner: {
    usage: "/owner stats|user-lookup|user-ban|user-unban",
    description: "Operator controls limited to OWNER_DISCORD_IDS configured by the deployment owner.",
  },
  settings: {
    usage: "/settings status|notifications-on|notifications-off|mainnet|testnet",
    description: "Control network defaults and optional direct-message notifications.",
  },
  server: {
    usage: "/server status|log-channel-set|log-channel-clear|admin-role-set",
    description: "Configure Crypto server logging and admin roles (Manage Server required).",
  },
  transactions: {
    usage: "/transactions recent|lookup|summary|deposits|withdrawals|tips",
    description: "Review only your own transaction records and summaries.",
  },
  assets: {
    usage: "/assets list|lookup|native-prices",
    description: "Inspect configured native assets, token contracts, and prices.",
  },
  security: {
    usage: "/security status|dashboard|backup-guide|privacy",
    description: "Check security setup and access authenticated recovery tools.",
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
    .setDescription("A crypto tipping bot supporting EVM, Solana, and Litecoin networks with mainnet & testnet.")
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
        value: "`/network` `/settings` `/server`",
        inline: true,
      },
      {
        name: "Account & Security",
        value: "`/account` `/security` `/transactions` `/assets`",
        inline: true,
      },
      {
        name: "Owner operations",
        value: "`/owner` (allowlisted operators only)",
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
