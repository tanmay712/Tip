/**
 * Admin commands for Hodlr.
 *
 * Usage: $admin <subcommand> [args]
 *
 * Subcommands:
 *   ban @user [reason]          — Ban a user from using the bot
 *   unban @user                 — Unban a user
 *   balanceof @user [chain]     — View a user's internal balance
 *   broadcast <message>         — DM all known users
 *   logchannel [#channel|off]   — Set or clear the log channel
 *   stats                       — Show bot-wide stats
 *   config                      — View this guild's config
 *
 * Only guild admins (Manage Server) or users with the configured admin role
 * can run these commands.
 */

import { type Message, PermissionFlagsBits, type TextChannel } from "discord.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as txRepo from "../../database/repositories/transaction.repo.js";
import * as configRepo from "../../database/repositories/config.repo.js";
import { prisma } from "../../database/client.js";
import { formatTokenAmount } from "../../utils/format.js";
import { brandEmbed, errorEmbed, successEmbed } from "../components/embeds.js";
import { EMOJIS, PREFIX } from "../../utils/constants.js";

const ADMIN_HELP = `
**$admin subcommands:**
\`ban @user [reason]\` — Block user from using the bot
\`unban @user\` — Remove a ban
\`balanceof @user [chain]\` — View a user's balance
\`broadcast <message>\` — DM all known users
\`logchannel #channel\` — Set log channel
\`logchannel off\` — Remove log channel
\`stats\` — Bot-wide stats
\`config\` — View guild configuration
`.trim();

async function isAdmin(message: Message): Promise<boolean> {
  if (!message.guild) return false;

  const member = message.member;
  if (!member) return false;

  // Guild admins always have access
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

  // Check configured admin role
  const cfg = await configRepo.getGuildConfig(message.guild.id);
  if (cfg?.adminRoleId && member.roles.cache.has(cfg.adminRoleId)) return true;

  return false;
}

export async function handleAdminCommand(message: Message, args: string[]): Promise<void> {
  if (!(await isAdmin(message))) {
    await message.reply({
      embeds: [errorEmbed("You need **Manage Server** permission to use admin commands.")],
    });
    return;
  }

  const sub = args[0]?.toLowerCase();

  switch (sub) {
    case "ban":       return adminBan(message, args.slice(1));
    case "unban":     return adminUnban(message, args.slice(1));
    case "balanceof": return adminBalanceof(message, args.slice(1));
    case "broadcast": return adminBroadcast(message, args.slice(1));
    case "logchannel":return adminLogchannel(message, args.slice(1));
    case "stats":     return adminStats(message);
    case "config":    return adminConfig(message);
    default:
      await message.reply({
        embeds: [
          brandEmbed()
            .setTitle(`${EMOJIS.warning} Admin Commands`)
            .setDescription(ADMIN_HELP),
        ],
      });
  }
}

// ---------------------------------------------------------------------------

async function adminBan(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.users.first();
  if (!target) {
    await message.reply({ embeds: [errorEmbed("Mention a user to ban. Usage: `$admin ban @user [reason]`")] });
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ embeds: [errorEmbed("You can't ban yourself.")] });
    return;
  }

  const reasonParts = args.filter((a) => !a.match(/^<@!?\d+>$/));
  const reason = reasonParts.join(" ") || undefined;

  await configRepo.banUser(target.id, message.author.id, reason);

  await message.reply({
    embeds: [
      successEmbed(
        "User Banned",
        `**${target.username}** has been banned from using Hodlr.` +
          (reason ? `\nReason: ${reason}` : ""),
      ),
    ],
  });

  // Notify the banned user
  try {
    await target.send({
      embeds: [
        errorEmbed(
          `You have been banned from using **Hodlr** in **${message.guild?.name ?? "a server"}**.` +
            (reason ? `\nReason: ${reason}` : ""),
        ),
      ],
    });
  } catch {
    // DMs disabled
  }
}

async function adminUnban(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.users.first();
  if (!target) {
    await message.reply({ embeds: [errorEmbed("Mention a user to unban. Usage: `$admin unban @user`")] });
    return;
  }

  const result = await configRepo.unbanUser(target.id);
  if (!result) {
    await message.reply({ embeds: [errorEmbed(`**${target.username}** is not banned.`)] });
    return;
  }

  await message.reply({
    embeds: [successEmbed("User Unbanned", `**${target.username}** can now use Hodlr again.`)],
  });
}

async function adminBalanceof(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.users.first();
  if (!target) {
    await message.reply({
      embeds: [errorEmbed("Mention a user. Usage: `$admin balanceof @user [chain]`")],
    });
    return;
  }

  const chainArg = args.find((a) => !a.match(/^<@!?\d+>$/))?.toLowerCase();
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";

  const user = await userRepo.getUser(target.id);
  if (!user) {
    await message.reply({ embeds: [errorEmbed(`No account found for **${target.username}**`)] });
    return;
  }

  const chains = chainArg ? [chainArg] : CHAIN_IDS;
  const embed = brandEmbed()
    .setTitle(`${EMOJIS.wallet} Balance — ${target.username}`)
    .setDescription(
      isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`,
    );

  let hasAny = false;
  for (const chainId of chains) {
    if (!CHAIN_IDS.includes(chainId)) continue;
    const chain = getChain(chainId);
    const bal = await txRepo.getUserBalance(user.id, chainId, "native", isTestnet);
    if (bal > 0n || chainArg) {
      embed.addFields({
        name: `${chain.emoji} ${chain.name}`,
        value: `\`${formatTokenAmount(bal.toString(), chain.nativeDecimals)} ${chain.nativeToken}\``,
        inline: true,
      });
      hasAny = true;
    }
  }

  if (!hasAny) {
    embed.setDescription(`${embed.data.description}\n\nNo balances found.`);
  }

  await message.reply({ embeds: [embed] });
}

async function adminBroadcast(message: Message, args: string[]): Promise<void> {
  const text = args.join(" ");
  if (!text) {
    await message.reply({ embeds: [errorEmbed("Provide a message. Usage: `$admin broadcast <message>`")] });
    return;
  }

  const allUsers = await prisma.user.findMany({ select: { discordId: true } });
  let sent = 0;
  let failed = 0;

  const broadcastEmbed = brandEmbed()
    .setTitle(`${EMOJIS.warning} Announcement`)
    .setDescription(text)
    .setFooter({ text: `Broadcast from ${message.guild?.name ?? "Hodlr Admin"} · Hodlr` });

  for (const u of allUsers) {
    try {
      const user = await message.client.users.fetch(u.discordId);
      await user.send({ embeds: [broadcastEmbed] });
      sent++;
    } catch {
      failed++;
    }
  }

  await message.reply({
    embeds: [
      successEmbed(
        "Broadcast Sent",
        `Delivered to **${sent}** users. Failed for **${failed}** (DMs disabled).`,
      ),
    ],
  });
}

async function adminLogchannel(message: Message, args: string[]): Promise<void> {
  if (!message.guild) {
    await message.reply({ embeds: [errorEmbed("This command requires a server.")] });
    return;
  }

  const arg = args[0]?.toLowerCase();

  if (arg === "off" || arg === "none" || arg === "disable") {
    await configRepo.setLogChannel(message.guild.id, null);
    await message.reply({
      embeds: [successEmbed("Log Channel Disabled", "Hodlr will no longer log activity to a channel.")],
    });
    return;
  }

  const mentioned = message.mentions.channels.first() as TextChannel | undefined;
  if (!mentioned) {
    await message.reply({
      embeds: [
        errorEmbed(
          "Mention a channel or use `off`.\nUsage: `$admin logchannel #channel` or `$admin logchannel off`",
        ),
      ],
    });
    return;
  }

  await configRepo.setLogChannel(message.guild.id, mentioned.id);
  await message.reply({
    embeds: [
      successEmbed(
        "Log Channel Set",
        `All Hodlr activity will be logged to ${mentioned}.`,
      ),
    ],
  });
}

async function adminStats(message: Message): Promise<void> {
  const userCount = await prisma.user.count();
  const walletCount = await prisma.wallet.count();
  const mainnetTxCount = await prisma.transaction.count({ where: { isTestnet: false } });
  const testnetTxCount = await prisma.transaction.count({ where: { isTestnet: true } });
  const tipCount = await prisma.transaction.count({ where: { type: "tip" } });
  const depositCount = await prisma.transaction.count({ where: { type: "deposit" } });
  const withdrawCount = await prisma.transaction.count({ where: { type: "withdraw" } });
  const banCount = await prisma.bannedUser.count();

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.leaderboard} Hodlr Stats`)
        .addFields(
          { name: "👥 Users", value: `**${userCount.toLocaleString()}**`, inline: true },
          { name: "👛 Wallets", value: `**${walletCount.toLocaleString()}**`, inline: true },
          { name: "🚫 Banned", value: `**${banCount.toLocaleString()}**`, inline: true },
          { name: "📦 Mainnet Txns", value: `**${mainnetTxCount.toLocaleString()}**`, inline: true },
          { name: "🧪 Testnet Txns", value: `**${testnetTxCount.toLocaleString()}**`, inline: true },
          { name: "\u200b", value: "\u200b", inline: true },
          { name: `${EMOJIS.tip} Tips`, value: `**${tipCount.toLocaleString()}**`, inline: true },
          { name: `${EMOJIS.deposit} Deposits`, value: `**${depositCount.toLocaleString()}**`, inline: true },
          { name: `${EMOJIS.withdraw} Withdrawals`, value: `**${withdrawCount.toLocaleString()}**`, inline: true },
        ),
    ],
  });
}

async function adminConfig(message: Message): Promise<void> {
  if (!message.guild) {
    await message.reply({ embeds: [errorEmbed("This command requires a server.")] });
    return;
  }

  const cfg = await configRepo.getGuildConfig(message.guild.id);

  const logChannel = cfg?.logChannelId
    ? `<#${cfg.logChannelId}>`
    : "Not set";
  const adminRole = cfg?.adminRoleId
    ? `<@&${cfg.adminRoleId}>`
    : "Not set (Manage Server only)";

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`⚙️ Guild Config — ${message.guild.name}`)
        .addFields(
          { name: "Log Channel", value: logChannel, inline: true },
          { name: "Admin Role", value: adminRole, inline: true },
        ),
    ],
  });
}
