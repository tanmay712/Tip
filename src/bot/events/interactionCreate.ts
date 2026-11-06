import {
  type Client,
  type Interaction,
  ChatInputCommandInteraction,
  type ButtonInteraction,
} from "discord.js";
import { commands } from "../client.js";
import { checkRateLimit, recordUsage, formatRetryAfter } from "../../utils/rate-limit.js";
import { logger } from "../../utils/logger.js";
import { EMOJIS, PREFIX, BRAND } from "../../utils/constants.js";
import { brandEmbed, errorEmbed } from "../components/embeds.js";
import { hodlrMenuRow1, hodlrMenuRow2, consentActionRow } from "../components/buttons.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as txRepo from "../../database/repositories/transaction.repo.js";
import { getOrCreateWallet } from "../../core/wallet.service.js";
import { getLeaderboardUSD } from "../../core/leaderboard.service.js";
import { getPrice } from "../../core/price.service.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { formatTokenAmount, formatUsd } from "../../utils/format.js";
import { getSolBalance } from "../../blockchain/solana.js";
import { withComponentsV2 } from "../components/v2.js";
import { config } from "../../config.js";

const MEDALS = ["🥇", "🥈", "🥉"];
const PRICE_SYMBOLS = ["ETH", "SOL", "AVAX", "POL", "ARB", "OP", "USDC", "LTC", "BTC"];

export function registerInteractionHandler(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      await withComponentsV2(interaction, () => handleCommand(interaction));
    } else if (interaction.isButton()) {
      await withComponentsV2(interaction, () => handleButton(interaction));
    }
  });
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) return;

  const rl = checkRateLimit(interaction.user.id, "command");
  if (!rl.allowed) {
    await interaction.reply({
      content: `${EMOJIS.warning} Slow down! Try again in **${formatRetryAfter(rl.retryAfterMs)}**.`,
      ephemeral: true,
    });
    return;
  }
  recordUsage(interaction.user.id, "command");

  try {
    await userRepo.findOrCreateUser(interaction.user.id);
    if (!(await userRepo.hasCurrentConsent(interaction.user.id))) {
      if (!config.dashboard.baseUrl || !config.dashboard.legalDocumentsApproved || (process.env.NODE_ENV === "production" && !config.dashboard.baseUrl.startsWith("https://"))) {
        await interaction.reply({ content: "Crypto is not ready to collect consent. The operator must configure APP_BASE_URL, publish reviewed Privacy Policy and Terms, and set LEGAL_DOCUMENTS_APPROVED=true.", ephemeral: true });
        return;
      }
      await interaction.reply({
        content: consentPrompt(),
        components: [consentActionRow()],
        ephemeral: true,
      });
      return;
    }
    await command.execute(interaction);
  } catch (err) {
    logger.error(
      { err, command: interaction.commandName, user: interaction.user.id },
      "Command execution failed",
    );
    const msg = `${EMOJIS.error} Something went wrong. Please try again.`;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

function consentPrompt(): string {
  const base = config.dashboard.baseUrl;
  const legalLinks = base
    ? `Read the [Privacy Policy](${base}/privacy) and [Terms of Service](${base}/terms).`
    : "Privacy and Terms pages will be available after APP_BASE_URL is configured.";
  return `Before using Crypto, please review and accept the Privacy Policy and Terms. ${legalLinks}\n` +
    `Acceptance version: ${config.dashboard.termsVersion}. You can decline; no tipping commands will run until you accept.`;
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id === "tipx:consent:accept") {
    await userRepo.findOrCreateUser(interaction.user.id);
    await userRepo.acceptCurrentTerms(interaction.user.id);
    await interaction.reply({ content: "Thanks — your acceptance is recorded. You can now use Crypto.", ephemeral: true });
    if (config.dashboard.baseUrl) {
      try {
        await interaction.user.send(
          `Your Crypto account dashboard is ready: ${config.dashboard.baseUrl}/auth/discord\n` +
          "Sign in with Discord (identify-only access) to create your one-time recovery key. Keep that key offline; it is required to decrypt your recovery backup.",
        );
      } catch {
        await interaction.followUp({
          content: `I couldn't DM you. Open your dashboard when DMs are enabled: ${config.dashboard.baseUrl}/auth/discord`,
          ephemeral: true,
        });
      }
    }
    return;
  }
  if (id === "tipx:consent:decline") {
    await userRepo.findOrCreateUser(interaction.user.id);
    await userRepo.declineCurrentTerms(interaction.user.id);
    await interaction.reply({ content: "You declined the Privacy Policy and Terms. Crypto commands remain disabled until you accept.", ephemeral: true });
    return;
  }

  // Airdrop claim buttons are handled by the airdrop command itself
  if (id.startsWith("airdrop_claim:")) return;

  if (!id.startsWith("tipx:") && !id.startsWith("hodlr:")) return;

  await interaction.deferReply({ ephemeral: true });

  const action = id.slice(id.indexOf(":") + 1);

  try {
    switch (action) {
      case "balance":       return await btnBalance(interaction);
      case "wallet":        return await btnWallet(interaction);
      case "deposit":       return await btnDeposit(interaction);
      case "withdraw_info": return await btnWithdrawInfo(interaction);
      case "tip_info":      return await btnTipInfo(interaction);
      case "leaderboard":   return await btnLeaderboard(interaction);
      case "prices":        return await btnPrices(interaction);
      case "help":          return await btnHelp(interaction);
      default:
        await interaction.editReply({ content: "Unknown action." });
    }
  } catch (err) {
    logger.error({ err, action, user: interaction.user.id }, "Button handler failed");
    await interaction.editReply({ content: `${EMOJIS.error} Something went wrong.` });
  }
}

// ---------------------------------------------------------------------------
// Button handlers
// ---------------------------------------------------------------------------

async function btnBalance(interaction: ButtonInteraction): Promise<void> {
  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const user = await userRepo.findOrCreateUser(interaction.user.id);

  const embed = brandEmbed()
    .setTitle(`${EMOJIS.wallet} Your Balances`)
    .setDescription(
      isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`,
    );

  let hasAny = false;
  for (const chainId of CHAIN_IDS) {
    const chain = getChain(chainId);
    const bal = await txRepo.getUserBalance(user.id, chainId, "native", isTestnet);
    if (bal > 0n) {
      embed.addFields({
        name: `${chain.emoji} ${chain.name}`,
        value: `\`${formatTokenAmount(bal.toString(), chain.nativeDecimals)} ${chain.nativeToken}\``,
        inline: true,
      });
      hasAny = true;
    }
  }

  if (!hasAny) {
    embed.addFields({
      name: "No balances yet",
      value: `Use \`${PREFIX}deposit <chain>\` to fund your account.`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function btnWallet(interaction: ButtonInteraction): Promise<void> {
  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const networkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  const embed = brandEmbed()
    .setTitle(`${EMOJIS.wallet} Your Wallets`)
    .setDescription(networkLabel);

  for (const chainId of CHAIN_IDS) {
    const chain = getChain(chainId);
    const wallet = await getOrCreateWallet(interaction.user.id, chainId, isTestnet);
    embed.addFields({
      name: `${chain.emoji} ${chain.name}`,
      value: `\`${wallet.address}\``,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function btnDeposit(interaction: ButtonInteraction): Promise<void> {
  await interaction.editReply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.deposit} Deposit`)
        .setDescription(
          `To deposit, run:\n\`\`\`\n${PREFIX}deposit <chain>\n\`\`\`\n` +
            `**Available chains:**\n` +
            CHAIN_IDS.map((c) => {
              const ch = getChain(c);
              return `${ch.emoji} \`${c}\``;
            }).join("  "),
        ),
    ],
  });
}

async function btnWithdrawInfo(interaction: ButtonInteraction): Promise<void> {
  await interaction.editReply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.withdraw} Withdraw`)
        .setDescription(
          `To withdraw, run:\n\`\`\`\n${PREFIX}withdraw <chain> <address> <amount> <token>\n\`\`\`\n` +
            `Example:\n\`\`\`\n${PREFIX}withdraw ethereum 0xYourAddress 0.01 ETH\n\`\`\``,
        )
        .addFields({
          name: "Note",
          value: "For privacy, this command will redirect you to DMs automatically.",
          inline: false,
        }),
    ],
  });
}

async function btnTipInfo(interaction: ButtonInteraction): Promise<void> {
  await interaction.editReply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.tip} Tip`)
        .setDescription(
          `Send crypto to anyone instantly:\n\`\`\`\n${PREFIX}tip @user <amount> <token> [chain]\n\`\`\`\n` +
            `Example:\n\`\`\`\n${PREFIX}tip @alice 0.01 ETH\n\`\`\``,
        )
        .addFields({
          name: "Works on",
          value: CHAIN_IDS.map((c) => `${getChain(c).emoji} ${getChain(c).name}`).join("  "),
          inline: false,
        }),
    ],
  });
}

async function btnLeaderboard(interaction: ButtonInteraction): Promise<void> {
  const network = await userRepo.getUserNetwork(interaction.user.id);
  const isTestnet = network === "testnet";
  const entries = await getLeaderboardUSD(isTestnet, null, 10);

  const networkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  if (entries.length === 0) {
    await interaction.editReply({
      embeds: [
        brandEmbed()
          .setTitle(`${EMOJIS.leaderboard} Leaderboard`)
          .setDescription(`No tips recorded yet.\n${networkLabel}`),
      ],
    });
    return;
  }

  const lines = entries.map((e) => {
    const medal = MEDALS[e.rank - 1] || `**#${e.rank}**`;
    return `${medal} <@${e.discordId}>  **${e.totalAmount}**  *(${e.totalTips} tips)*`;
  });

  await interaction.editReply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.leaderboard} Top Tippers`)
        .setDescription(lines.join("\n"))
        .setFooter({ text: `${networkLabel} · sorted by USD sent` }),
    ],
  });
}

async function btnPrices(interaction: ButtonInteraction): Promise<void> {
  const lines: string[] = [];

  for (const sym of PRICE_SYMBOLS) {
    const info = await getPrice(sym);
    if (!info) continue;
    const changeEmoji = info.change24h >= 0 ? "📈" : "📉";
    const changeStr = `${info.change24h >= 0 ? "+" : ""}${info.change24h.toFixed(2)}%`;
    lines.push(`**${sym}** ${formatUsd(info.price)}  ${changeEmoji} ${changeStr}`);
  }

  await interaction.editReply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.price} Prices`)
        .setDescription(lines.join("\n") || "No price data available.")
        .setFooter({ text: "Powered by CoinGecko · Crypto" }),
    ],
  });
}

async function btnHelp(interaction: ButtonInteraction): Promise<void> {
  await interaction.editReply({
    embeds: [
      brandEmbed()
        .setTitle(`${BRAND.name} Help`)
        .addFields(
          { name: `${EMOJIS.tip} Tipping`, value: `\`${PREFIX}tip\`  \`${PREFIX}rain\`  \`${PREFIX}airdrop\``, inline: false },
          { name: `${EMOJIS.wallet} Wallet`, value: `\`${PREFIX}deposit\`  \`${PREFIX}withdraw\`  \`${PREFIX}balance\`  \`${PREFIX}wallet\``, inline: false },
          { name: `${EMOJIS.history} Info`, value: `\`${PREFIX}leaderboard\`  \`${PREFIX}price\`  \`${PREFIX}crypto\``, inline: false },
          { name: `⚙️ Settings`, value: `\`${PREFIX}network\`  \`${PREFIX}config\``, inline: false },
          { name: "Details", value: `Run \`${PREFIX}help <command>\` for full usage.`, inline: false },
        ),
    ],
  });
}
