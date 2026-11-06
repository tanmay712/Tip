import { type Message, type GuildMember, ComponentType, type ButtonInteraction } from "discord.js";
import { ethers } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { findToken } from "../../blockchain/tokens.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as txRepo from "../../database/repositories/transaction.repo.js";
import * as airdropRepo from "../../database/repositories/airdrop.repo.js";
import * as configRepo from "../../database/repositories/config.repo.js";
import { handleAdminCommand } from "./admin.js";
import { getOrCreateWallet, getAllWallets } from "../../core/wallet.service.js";
import { dmUserIfEnabled, logToChannel } from "../notifications.js";
import { activeClient } from "../client.js";
import { checkRateLimit, recordUsage, formatRetryAfter, type RateLimitAction } from "../../utils/rate-limit.js";
import { logSecurityEvent } from "../../utils/security.js";
import { sendTip } from "../../core/tip.service.js";
import { sendRain } from "../../core/rain.service.js";
import { getLeaderboard, getLeaderboardUSD, getLeaderboardTips } from "../../core/leaderboard.service.js";
import { getPrice, getPrices } from "../../core/price.service.js";
import { withdraw } from "../../core/withdraw.service.js";
import { createAirdrop, claimAirdrop } from "../../core/airdrop.service.js";
import * as alchemyApi from "../../blockchain/alchemy.js";
import { getSolBalance } from "../../blockchain/solana.js";
import { isLitecoinAddress, isLitecoinConfigured } from "../../blockchain/litecoin.js";
import { parseTokenAmount, formatTokenAmount, formatUsd } from "../../utils/format.js";
import {
  tipEmbed,
  rainEmbed,
  airdropEmbed,
  balanceEmbed,
  errorEmbed,
  successEmbed,
  brandEmbed,
  walletEmbed,
  withdrawEmbed,
  depositEmbed,
} from "../components/embeds.js";
import {
  airdropClaimButton,
  tipActionRow,
  depositActionRow,
  withdrawActionRow,
  hodlrMenuRow1,
  hodlrMenuRow2,
  consentActionRow,
} from "../components/buttons.js";
import { BRAND, EMOJIS, PREFIX, LIMITS } from "../../utils/constants.js";
import { config } from "../../config.js";

const MEDALS = ["🥇", "🥈", "🥉"];

const COMMAND_HELP: Record<string, { usage: string; description: string }> = {
  tip: {
    usage: `${PREFIX}tip @user <amount> <token> [chain]`,
    description: "Send an instant off-chain tip. Example: `$tip @alice 0.01 ETH ethereum`",
  },
  rain: {
    usage: `${PREFIX}rain <amount> <token> [chain]`,
    description: "Split tokens evenly across active server members.",
  },
  airdrop: {
    usage: `${PREFIX}airdrop <amount> <token> <slots> [chain]`,
    description: "Drop tokens for the first N people to claim. Example: `$airdrop 1 ETH 10`",
  },
  balance: {
    usage: `${PREFIX}balance [chain]`,
    description: "Check your balance. Add a chain name for on-chain detail.",
  },
  wallet: {
    usage: `${PREFIX}wallet [deposit <chain> | withdraw <chain> <address> <amount> <token>]`,
    description: "View wallets, get a deposit address, or withdraw funds.",
  },
  deposit: {
    usage: `${PREFIX}deposit <chain>`,
    description: "Get your deposit address for a chain.",
  },
  withdraw: {
    usage: `${PREFIX}withdraw <chain> <address> <amount> <token>`,
    description: "Withdraw tokens to an external wallet address.",
  },
  network: {
    usage: `${PREFIX}network [mainnet|testnet]`,
    description: "View or switch your active network.",
  },
  price: {
    usage: `${PREFIX}price <token>`,
    description: "Get the current USD price and 24h change for a token.",
  },
  leaderboard: {
    usage: `${PREFIX}leaderboard [token] [tips]`,
    description:
      "Top tippers sorted by USD sent. Filter by token (e.g. `eth`) or switch to count mode with `tips`.",
  },
  config: {
    usage: `${PREFIX}config`,
    description: "View your current settings.",
  },
  notifications: {
    usage: `${PREFIX}notifications [on|off]`,
    description: "Toggle DM notifications for tips, rain, airdrops, and deposits.",
  },
  privatekey: {
    usage: `${PREFIX}privatekey`,
    description: "Legacy alias for the authenticated encrypted recovery dashboard; keys are never sent in chat.",
  },
  crypto: {
    usage: `${PREFIX}crypto`,
    description: "Crypto overview, stats, and quick-action buttons.",
  },
  tipx: {
    usage: `${PREFIX}tipx`,
    description: "Legacy alias for the Crypto overview.",
  },
  hodlr: {
    usage: `${PREFIX}hodlr`,
    description: "Legacy alias for the Crypto overview.",
  },
};

/**
 * Check a per-action rate limit and reply with an error embed if exceeded.
 * Returns true if the user is rate limited (caller should return early).
 */
async function isRateLimited(
  message: Message,
  action: RateLimitAction,
): Promise<boolean> {
  const result = checkRateLimit(message.author.id, action);
  if (!result.allowed) {
    const retryStr = formatRetryAfter(result.retryAfterMs);
    await message.reply({
      embeds: [
        brandEmbed()
          .setColor(0xff8800)
          .setTitle("⏱️ Slow down")
          .setDescription(
            `You're doing that too fast.\n` +
              `Limit: **${result.limitLabel}**\n` +
              `Try again in **${retryStr}**.`,
          ),
      ],
    });
    logSecurityEvent({
      type: "RATE_LIMITED",
      discordId: message.author.id,
      extra: { action, limitLabel: result.limitLabel ?? "", retryAfterMs: result.retryAfterMs },
    });
    return true;
  }
  return false;
}

/**
 * For sensitive commands (withdraw/deposit): if in a guild channel, redirect to DMs.
 * Returns true if redirected to DMs, false if already in a DM.
 */
async function redirectToDm(message: Message): Promise<boolean> {
  if (!message.guild) return false;
  try {
    await message.reply({
      embeds: [
        brandEmbed()
          .setColor(0xf5a623)
          .setTitle(`${EMOJIS.wallet} Sent to DMs`)
          .setDescription("Wallet operations are handled privately. Check your DMs."),
      ],
    });
  } catch {
    // channel permissions issue
  }
  return true;
}

export async function handlePrefixCommand(message: Message): Promise<void> {
  const content = message.content.slice(PREFIX.length).trim();
  if (!content) return;

  const parts = content.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // General command-rate gate — catches spam before any DB work
  if (cmd !== "admin") {
    const rl = checkRateLimit(message.author.id, "command");
    if (!rl.allowed) {
      const retryStr = formatRetryAfter(rl.retryAfterMs);
      await message.reply({
        embeds: [
          brandEmbed()
            .setColor(0xff4444)
            .setTitle("🛑 Too many commands")
            .setDescription(`Max 15 commands per minute. Try again in **${retryStr}**.`),
        ],
      });
      logSecurityEvent({
        type: "COMMAND_SPAM",
        discordId: message.author.id,
        extra: { cmd, retryAfterMs: rl.retryAfterMs },
      });
      return;
    }
    recordUsage(message.author.id, "command");
  }

  await userRepo.findOrCreateUser(message.author.id);
  if (!(await userRepo.hasCurrentConsent(message.author.id))) {
    const baseUrl = config.dashboard.baseUrl;
    if (!baseUrl || !config.dashboard.legalDocumentsApproved || (process.env.NODE_ENV === "production" && !baseUrl.startsWith("https://"))) {
      await message.reply("Crypto is not ready to collect consent. The operator must configure APP_BASE_URL, publish reviewed Privacy Policy and Terms, and set LEGAL_DOCUMENTS_APPROVED=true.");
      return;
    }
    const legal = `Review the Privacy Policy (${baseUrl}/privacy) and Terms (${baseUrl}/terms). `;
    try {
      await message.author.send({
        content: `${legal}Accept to enable Crypto commands, or decline to leave the service disabled.`,
        components: [consentActionRow()],
      });
      await message.reply("Please check your DMs to review Crypto's Privacy Policy and Terms before using commands.");
    } catch {
      await message.reply("Crypto needs your consent before it can run commands. Enable DMs and retry, or use a slash command to review the consent prompt privately.");
    }
    return;
  }

  // Check if user is banned (skip admin commands so admins can unban)
  if (cmd !== "admin") {
    try {
      const banned = await configRepo.isUserBanned(message.author.id);
      if (banned) {
        await message.reply({ embeds: [errorEmbed("You have been banned from using Crypto.")] });
        return;
      }
    } catch {
      // DB table may not exist yet — ignore and continue
    }
  }

  switch (cmd) {
    case "help":        return handleHelp(message, args);
    case "tip":         return handleTip(message, args);
    case "balance":     return handleBalance(message, args);
    case "network":     return handleNetwork(message, args);
    case "price":       return handlePrice(message, args);
    case "wallet":      return handleWallet(message, args);
    case "rain":        return handleRain(message, args);
    case "airdrop":     return handleAirdrop(message, args);
    case "leaderboard": return handleLeaderboard(message, args);
    // top-level aliases
    case "withdraw":    return handleWithdrawAlias(message, args);
    case "deposit":     return handleDepositAlias(message, args);
    // extras
    case "crypto":
    case "tipx": // backwards-compatible alias
    case "hodlr":         return handleCrypto(message);
    case "config":        return handleConfig(message);
    case "notifications": return handleNotifications(message, args);
    case "privatekey":    return handlePrivateKey(message, args);
    // admin
    case "admin":         return handleAdminCommand(message, args);
    default:
      await message.reply({
        embeds: [
          errorEmbed(
            `Unknown command \`${PREFIX}${cmd}\`. Use \`${PREFIX}help\` for a list of commands.`,
          ),
        ],
      });
  }
}

// ---------------------------------------------------------------------------
// HELP
// ---------------------------------------------------------------------------

async function handleHelp(message: Message, args: string[]): Promise<void> {
  const specificCmd = args[0]?.toLowerCase();

  if (specificCmd && COMMAND_HELP[specificCmd]) {
    const help = COMMAND_HELP[specificCmd];
    await message.reply({
      embeds: [
        brandEmbed()
          .setTitle(`${PREFIX}${specificCmd}`)
          .addFields(
            { name: "Usage", value: `\`${help.usage}\``, inline: false },
            { name: "Description", value: help.description, inline: false },
          ),
      ],
    });
    return;
  }

  const chainList = CHAIN_IDS.map((c) => {
    const ch = getChain(c);
    return `${ch.emoji} **${ch.name}** — ${ch.nativeToken}`;
  }).join("\n");

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`${BRAND.name}`)
        .setDescription(
          `Prefix: \`${PREFIX}\` or use slash commands\nRun \`${PREFIX}help <command>\` for details`,
        )
        .addFields(
          {
            name: `${EMOJIS.tip} Tipping`,
            value: `\`${PREFIX}tip\`  \`${PREFIX}rain\`  \`${PREFIX}airdrop\``,
            inline: false,
          },
          {
            name: `${EMOJIS.wallet} Wallet`,
            value: `\`${PREFIX}deposit\`  \`${PREFIX}withdraw\`  \`${PREFIX}balance\`  \`${PREFIX}wallet\``,
            inline: false,
          },
          {
            name: `${EMOJIS.history} Info`,
            value: `\`${PREFIX}leaderboard\`  \`${PREFIX}price\`  \`${PREFIX}crypto\``,
            inline: false,
          },
          {
            name: `⚙️ Settings`,
            value: `\`${PREFIX}network\`  \`${PREFIX}config\`  \`${PREFIX}notifications\`  \`${PREFIX}privatekey\``,
            inline: false,
          },
          { name: "Chains", value: chainList, inline: false },
        ),
    ],
  });
}

// ---------------------------------------------------------------------------
// TIP
// ---------------------------------------------------------------------------

async function handleTip(message: Message, args: string[]): Promise<void> {
  if (await isRateLimited(message, "tip")) return;

  const targets = [...message.mentions.users.values()].filter(
    (u) => !u.bot && u.id !== message.author.id,
  );
  if (targets.length === 0) {
    await message.reply({ embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.tip.usage}\``)] });
    return;
  }

  const nonMentionArgs = args.filter((a) => !a.match(/^<@!?\d+>$/));
  const [amountStr, tokenRaw, chainArg] = nonMentionArgs;

  if (!amountStr || !tokenRaw) {
    await message.reply({ embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.tip.usage}\``)] });
    return;
  }

  const totalAmount = parseFloat(amountStr);
  if (isNaN(totalAmount) || totalAmount <= 0) {
    await message.reply({ embeds: [errorEmbed("Invalid amount")] });
    return;
  }

  const tokenSymbol = tokenRaw.toUpperCase();
  const chainId = chainArg?.toLowerCase() || "ethereum";

  if (!CHAIN_IDS.includes(chainId)) {
    await message.reply({
      embeds: [errorEmbed(`Unknown chain \`${chainId}\`. Valid: ${CHAIN_IDS.join(", ")}`)],
    });
    return;
  }

  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const chain = getChain(chainId);

  let token = "native";
  let decimals = chain.nativeDecimals;
  if (tokenSymbol !== chain.nativeToken) {
    const tokenInfo = findToken(tokenSymbol, chainId);
    if (!tokenInfo) {
      await message.reply({
        embeds: [errorEmbed(`Token ${tokenSymbol} not found on ${chain.name}`)],
      });
      return;
    }
    token = tokenInfo.contractAddress;
    decimals = tokenInfo.decimals;
  }

  // Per-recipient amount (split evenly)
  const perAmountStr = (totalAmount / targets.length).toFixed(
    decimals > 8 ? 8 : decimals,
  );
  const rawPerAmount = parseTokenAmount(perAmountStr, decimals).toString();
  const rawTotalAmount = parseTokenAmount(amountStr, decimals).toString();

  const failed: string[] = [];
  const succeeded: string[] = [];

  for (const target of targets) {
    const result = await sendTip(
      message.author.id,
      target.id,
      rawPerAmount,
      tokenSymbol,
      chainId,
      token,
      isTestnet,
      decimals,
    );
    if (result.success) {
      succeeded.push(target.id);
      recordUsage(message.author.id, "tip");
    } else {
      failed.push(`<@${target.id}> (${result.error})`);
      // Stop early on first failure (likely insufficient balance)
      break;
    }
  }

  // Alert if user hit the per-minute tip cap in a single burst
  if (succeeded.length >= 5) {
    logSecurityEvent({
      type: "TIP_BURST_DETECTED",
      discordId: message.author.id,
      extra: { recipients: succeeded.length, tokenSymbol, chainId },
    });
  }

  if (succeeded.length === 0) {
    await message.reply({ embeds: [errorEmbed(failed[0] ?? "Tip failed")] });
    return;
  }

  const networkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;
  const formattedPer = formatTokenAmount(rawPerAmount, decimals);
  const formattedTotal = formatTokenAmount(
    (BigInt(rawPerAmount) * BigInt(succeeded.length)).toString(),
    decimals,
  );
  const recipientList = succeeded.map((id) => `<@${id}>`).join(", ");

  const embed = brandEmbed()
    .setColor(0x00ff88)
    .setTitle(`${EMOJIS.tip} Tip Sent`)
    .setDescription(
      `<@${message.author.id}> sent **${formattedPer} ${tokenSymbol}** to ${recipientList} on ${chain.emoji} **${chain.name}** ${networkLabel}`,
    );

  if (succeeded.length > 1) {
    embed.addFields({
      name: "Total",
      value: `\`${formattedTotal} ${tokenSymbol}\` split among **${succeeded.length}** recipients`,
      inline: false,
    });
  }

  if (failed.length > 0) {
    embed.addFields({ name: "Failed", value: failed.join("\n"), inline: false });
  }

  await message.reply({ embeds: [embed], components: [tipActionRow()] });

  // Log to guild channel
  logToChannel(message.guild?.id, [
    brandEmbed()
      .setColor(0x00ff88)
      .setTitle(`${EMOJIS.tip} Tip`)
      .setDescription(
        `<@${message.author.id}> tipped **${formattedTotal} ${tokenSymbol}** to ${recipientList} on ${chain.emoji} ${chain.name}`,
      )
      .setFooter({ text: networkLabel }),
  ]).catch(() => {});

  // DM each recipient
  for (const targetId of succeeded) {
    const targetUser = message.mentions.users.get(targetId);
    dmUserIfEnabled(targetId, [
      brandEmbed()
        .setColor(0x00ff88)
        .setTitle(`${EMOJIS.tip} You received a tip!`)
        .setDescription(
          `<@${message.author.id}> sent you **${formattedPer} ${tokenSymbol}** on ${chain.emoji} **${chain.name}** ${networkLabel}`,
        )
        .setFooter({ text: `Use ${PREFIX}balance to check your balance · Crypto` }),
    ]).catch(() => {});
    void targetUser;
  }
}

// ---------------------------------------------------------------------------
// BALANCE
// ---------------------------------------------------------------------------

async function handleBalance(message: Message, args: string[]): Promise<void> {
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const specificChain = args[0]?.toLowerCase();

  if (specificChain && !CHAIN_IDS.includes(specificChain)) {
    await message.reply({
      embeds: [
        errorEmbed(`Unknown chain \`${specificChain}\`. Valid: ${CHAIN_IDS.join(", ")}`),
      ],
    });
    return;
  }

  const user = await userRepo.findOrCreateUser(message.author.id);

  if (specificChain) {
    const chain = getChain(specificChain);
    const address = chain.type === "litecoin"
      ? ""
      : (await getOrCreateWallet(message.author.id, specificChain, isTestnet)).address;
    const balances: Array<{ symbol: string; amount: string; decimals: number }> = [];

    let nativeBalance: string;
    if (chain.type === "solana") {
      nativeBalance = await getSolBalance(address, isTestnet);
    } else if (chain.type === "litecoin") {
      nativeBalance = "0"; // Report the pooled internal liability, never add backing UTXOs twice.
    } else {
      nativeBalance = await alchemyApi.getBalance(specificChain, address, isTestnet);
    }

    const internalBalance = await txRepo.getUserBalance(
      user.id,
      specificChain,
      "native",
      isTestnet,
    );
    const totalNative = chain.type === "litecoin"
      ? internalBalance.toString()
      : (BigInt(nativeBalance) + internalBalance).toString();
    balances.push({
      symbol: chain.nativeToken,
      amount: totalNative,
      decimals: chain.nativeDecimals,
    });

    if (chain.type === "evm") {
      try {
        const tokenBals = await alchemyApi.getTokenBalances(specificChain, address, isTestnet);
        for (const tb of tokenBals) {
          const meta = await alchemyApi.getTokenMetadata(
            specificChain,
            tb.contractAddress,
            isTestnet,
          );
          if (meta.symbol) {
            balances.push({
              symbol: meta.symbol,
              amount: tb.balance,
              decimals: meta.decimals ?? 18,
            });
          }
        }
      } catch {
        // Token balance fetch may fail on some chains
      }
    }

    await message.reply({ embeds: [balanceEmbed({ chainId: specificChain, balances, isTestnet })] });
  } else {
    const embed = brandEmbed()
      .setTitle(`${EMOJIS.wallet} All Balances`)
      .setDescription(
        isTestnet
          ? `${EMOJIS.testnet} **Testnet** — internal balances`
          : `${EMOJIS.mainnet} **Mainnet** — internal balances`,
      );

    let hasBalances = false;
    for (const chainId of CHAIN_IDS) {
      const chain = getChain(chainId);
      const internalBalance = await txRepo.getUserBalance(user.id, chainId, "native", isTestnet);
      if (internalBalance > 0n) {
        embed.addFields({
          name: `${chain.emoji} ${chain.name}`,
          value: `\`${formatTokenAmount(internalBalance.toString(), chain.nativeDecimals)} ${chain.nativeToken}\``,
          inline: true,
        });
        hasBalances = true;
      }
    }

    if (!hasBalances) {
      embed.addFields({
        name: "No balances yet",
        value: `Use \`${PREFIX}deposit <chain>\` or \`${PREFIX}wallet deposit <chain>\` to get started!`,
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  }
}

// ---------------------------------------------------------------------------
// NETWORK
// ---------------------------------------------------------------------------

async function handleNetwork(message: Message, args: string[]): Promise<void> {
  const mode = args[0]?.toLowerCase();

  if (!mode) {
    const current = await userRepo.getUserNetwork(message.author.id);
    const emoji = current === "testnet" ? EMOJIS.testnet : EMOJIS.mainnet;
    await message.reply({
      embeds: [
        brandEmbed()
          .setTitle(`${EMOJIS.network} Current Network`)
          .setDescription(`You're on **${emoji} ${current}**`),
      ],
    });
    return;
  }

  if (mode !== "mainnet" && mode !== "testnet") {
    await message.reply({ embeds: [errorEmbed("Use `mainnet` or `testnet`")] });
    return;
  }

  await userRepo.findOrCreateUser(message.author.id);
  await userRepo.setUserNetwork(message.author.id, mode);

  const emoji = mode === "testnet" ? EMOJIS.testnet : EMOJIS.mainnet;
  await message.reply({
    embeds: [
      successEmbed(
        "Network Switched",
        `Now using **${emoji} ${mode}**. All commands will use ${mode} endpoints.`,
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// PRICE
// ---------------------------------------------------------------------------

async function handlePrice(message: Message, args: string[]): Promise<void> {
  const symbol = args[0]?.toUpperCase();
  if (!symbol) {
    await message.reply({ embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.price.usage}\``)] });
    return;
  }

  const info = await getPrice(symbol);
  if (!info) {
    await message.reply({
      embeds: [errorEmbed(`Price data not available for **${symbol}**`)],
    });
    return;
  }

  const changeEmoji = info.change24h >= 0 ? "📈" : "📉";
  const changeColor = info.change24h >= 0 ? 0x00ff88 : 0xff4444;
  const changeStr = `${info.change24h >= 0 ? "+" : ""}${info.change24h.toFixed(2)}%`;

  await message.reply({
    embeds: [
      brandEmbed()
        .setColor(changeColor)
        .setTitle(`${EMOJIS.price} ${symbol} Price`)
        .addFields(
          { name: "Price (USD)", value: `**${formatUsd(info.price)}**`, inline: true },
          { name: `${changeEmoji} 24h Change`, value: `**${changeStr}**`, inline: true },
        )
        .setFooter({ text: "Powered by CoinGecko · Crypto" }),
    ],
  });
}

// ---------------------------------------------------------------------------
// WALLET — view / deposit / withdraw subcommands
// ---------------------------------------------------------------------------

async function handleWallet(message: Message, args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase();

  if (sub === "deposit") {
    return handleDepositFlow(message, args.slice(1));
  }

  if (sub === "withdraw") {
    return handleWithdrawFlow(message, args.slice(1));
  }

  // Default: view all wallets
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";

  const wallets = await getAllWallets(message.author.id, isTestnet);
  const embed = brandEmbed()
    .setTitle(`${EMOJIS.wallet} Your Wallets`)
    .setDescription(
      `Network: ${isTestnet ? `${EMOJIS.testnet} **Testnet**` : `${EMOJIS.mainnet} **Mainnet**`}\n` +
        `Use \`${PREFIX}deposit <chain>\` to fund a wallet.`,
    );

  for (const w of wallets) {
    const chain = getChain(w.chain);
    embed.addFields({
      name: `${chain.emoji} ${chain.name}`,
      value: `\`${w.address}\``,
      inline: false,
    });
  }

  await message.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// DEPOSIT — core flow (used by $wallet deposit and $deposit alias)
// ---------------------------------------------------------------------------

async function handleDepositFlow(message: Message, args: string[]): Promise<void> {
  const shouldRedirect = await redirectToDm(message);

  const chainId = args[0]?.toLowerCase();
  if (!chainId || !CHAIN_IDS.includes(chainId)) {
    const errEmbed = errorEmbed(
      `Specify a valid chain: ${CHAIN_IDS.join(", ")}\nUsage: \`${COMMAND_HELP.deposit.usage}\``,
    );
    if (shouldRedirect) {
      await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [errEmbed] });
    }
    return;
  }

  if (chainId === "litecoin" && !isLitecoinConfigured()) {
    const errEmbed = errorEmbed("Litecoin deposits are disabled until the operator sets LITECOIN_API_TOKEN.");
    if (shouldRedirect) await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    else await message.reply({ embeds: [errEmbed] });
    return;
  }
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const result = await getOrCreateWallet(message.author.id, chainId, isTestnet);

  const embed = depositEmbed({ chain: chainId, address: result.address, isTestnet });

  if (shouldRedirect) {
    await message.author
      .send({ embeds: [embed], components: [depositActionRow()] })
      .catch(() => {});
  } else {
    await message.reply({ embeds: [embed], components: [depositActionRow()] });
  }

  // Never send a raw signing key through Discord. Use the encrypted recovery dashboard.

}

// ---------------------------------------------------------------------------
// WITHDRAW — core flow (used by $wallet withdraw and $withdraw alias)
// ---------------------------------------------------------------------------

async function handleWithdrawFlow(message: Message, args: string[]): Promise<void> {
  if (await isRateLimited(message, "withdraw")) return;

  const shouldRedirect = await redirectToDm(message);

  const [chainArg, toAddress, amountStr, tokenRaw] = args;

  if (!chainArg || !toAddress || !amountStr || !tokenRaw) {
    const errEmbed = errorEmbed(`Usage: \`${COMMAND_HELP.withdraw.usage}\``);
    if (shouldRedirect) {
      await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [errEmbed] });
    }
    return;
  }

  const chainId = chainArg.toLowerCase();
  if (!CHAIN_IDS.includes(chainId)) {
    const errEmbed = errorEmbed(
      `Unknown chain \`${chainId}\`. Valid: ${CHAIN_IDS.join(", ")}`,
    );
    if (shouldRedirect) {
      await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [errEmbed] });
    }
    return;
  }

  const chain = getChain(chainId);
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  if (chain.type === "litecoin" && !isLitecoinConfigured()) {
    const errEmbed = errorEmbed("Litecoin withdrawals are disabled until the operator sets LITECOIN_API_TOKEN.");
    if (shouldRedirect) await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    else await message.reply({ embeds: [errEmbed] });
    return;
  }

  if (chain.type === "solana") {
    try {
      new PublicKey(toAddress);
    } catch {
      const errEmbed = errorEmbed("Invalid Solana address");
      if (shouldRedirect) await message.author.send({ embeds: [errEmbed] }).catch(() => {});
      else await message.reply({ embeds: [errEmbed] });
      return;
    }
  } else if (chain.type === "litecoin") {
    if (!isLitecoinAddress(toAddress, isTestnet)) {
      const errEmbed = errorEmbed("Invalid Litecoin address for the selected network");
      if (shouldRedirect) await message.author.send({ embeds: [errEmbed] }).catch(() => {});
      else await message.reply({ embeds: [errEmbed] });
      return;
    }
  } else if (!ethers.isAddress(toAddress)) {
    const errEmbed = errorEmbed("Invalid EVM address");
    if (shouldRedirect) await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    else await message.reply({ embeds: [errEmbed] });
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    const errEmbed = errorEmbed("Invalid amount");
    if (shouldRedirect) {
      await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [errEmbed] });
    }
    return;
  }

  const tokenSymbol = tokenRaw.toUpperCase();

  let token = "native";
  let decimals = chain.nativeDecimals;
  if (tokenSymbol !== chain.nativeToken) {
    const tokenInfo = findToken(tokenSymbol, chainId);
    if (!tokenInfo) {
      const errEmbed = errorEmbed(`Token ${tokenSymbol} not found on ${chain.name}`);
      if (shouldRedirect) {
        await message.author.send({ embeds: [errEmbed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [errEmbed] });
      }
      return;
    }
    token = tokenInfo.contractAddress;
    decimals = tokenInfo.decimals;
  }

  // Send "processing" notice
  const processingEmbed = brandEmbed()
    .setTitle(`${EMOJIS.loading} Processing Withdrawal…`)
    .setDescription("Broadcasting your transaction to the network. Please wait.");
  let processingMsg: import("discord.js").Message | null = null;
  if (shouldRedirect) {
    processingMsg = await message.author.send({ embeds: [processingEmbed] }).catch(() => null);
  }

  const rawAmount = parseTokenAmount(amountStr, decimals).toString();
  const result = await withdraw(
    message.author.id,
    toAddress,
    rawAmount,
    tokenSymbol,
    chainId,
    token,
    decimals,
    isTestnet,
  );

  if (processingMsg) {
    await processingMsg.delete().catch(() => {});
  }

  if (!result.success) {
    const errEmbed = errorEmbed(result.error!);
    if (shouldRedirect) {
      await message.author.send({ embeds: [errEmbed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [errEmbed] });
    }
    return;
  }

  recordUsage(message.author.id, "withdraw");

  const resultEmbed = withdrawEmbed({
    chainId,
    txHash: result.txHash!,
    amount: rawAmount,
    decimals,
    tokenSymbol,
    toAddress,
    isTestnet,
    networkFee: result.networkFee,
  });

  if (shouldRedirect) {
    await message.author
      .send({ embeds: [resultEmbed], components: [withdrawActionRow()] })
      .catch(() => {});
  } else {
    await message.reply({ embeds: [resultEmbed], components: [withdrawActionRow()] });
  }
}

// Top-level aliases
async function handleDepositAlias(message: Message, args: string[]): Promise<void> {
  return handleDepositFlow(message, args);
}

async function handleWithdrawAlias(message: Message, args: string[]): Promise<void> {
  return handleWithdrawFlow(message, args);
}

// ---------------------------------------------------------------------------
// RAIN
// ---------------------------------------------------------------------------

async function handleRain(message: Message, args: string[]): Promise<void> {
  if (await isRateLimited(message, "rain")) return;

  const [amountStr, tokenRaw, chainArg] = args;
  if (!amountStr || !tokenRaw) {
    await message.reply({ embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.rain.usage}\``)] });
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    await message.reply({ embeds: [errorEmbed("Invalid amount")] });
    return;
  }

  const tokenSymbol = tokenRaw.toUpperCase();
  const chainId = chainArg?.toLowerCase() || "ethereum";

  if (!CHAIN_IDS.includes(chainId)) {
    await message.reply({
      embeds: [errorEmbed(`Unknown chain \`${chainId}\`. Valid: ${CHAIN_IDS.join(", ")}`)],
    });
    return;
  }

  const guild = message.guild;
  if (!guild) {
    await message.reply({ embeds: [errorEmbed("This command can only be used in servers")] });
    return;
  }

  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const chain = getChain(chainId);

  let token = "native";
  let decimals = chain.nativeDecimals;
  if (tokenSymbol !== chain.nativeToken) {
    const tokenInfo = findToken(tokenSymbol, chainId);
    if (!tokenInfo) {
      await message.reply({
        embeds: [errorEmbed(`Token ${tokenSymbol} not found on ${chain.name}`)],
      });
      return;
    }
    token = tokenInfo.contractAddress;
    decimals = tokenInfo.decimals;
  }

  const members = await guild.members.fetch({ limit: 100 });
  const eligible = members
    .filter((m: GuildMember) => !m.user.bot && m.user.id !== message.author.id)
    .map((m: GuildMember) => m.user.id)
    .slice(0, LIMITS.maxRainRecipients);

  if (eligible.length === 0) {
    await message.reply({ embeds: [errorEmbed("No eligible recipients")] });
    return;
  }

  const rawAmount = parseTokenAmount(amountStr, decimals).toString();
  const result = await sendRain(
    message.author.id,
    eligible,
    rawAmount,
    tokenSymbol,
    chainId,
    token,
    isTestnet,
  );

  if (!result.success) {
    await message.reply({ embeds: [errorEmbed(result.error!)] });
    return;
  }

  recordUsage(message.author.id, "rain");

  const networkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;
  const formattedTotal = formatTokenAmount(result.totalAmount, decimals);
  const formattedPer = formatTokenAmount(result.perUser, decimals);

  await message.reply({
    embeds: [
      rainEmbed({
        senderTag: message.author.displayName,
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

  // Log to guild channel
  logToChannel(message.guild?.id, [
    brandEmbed()
      .setColor(0x00aaff)
      .setTitle("🌧️ Rain")
      .setDescription(
        `<@${message.author.id}> rained **${formattedTotal} ${tokenSymbol}** (${formattedPer} each) on ${chain.emoji} ${chain.name}`,
      )
      .addFields({ name: "Recipients", value: `${result.recipients}`, inline: true })
      .setFooter({ text: networkLabel }),
  ]).catch(() => {});

  // DM each recipient
  if (result.recipientIds) {
    for (const recipientId of result.recipientIds) {
      dmUserIfEnabled(recipientId, [
        brandEmbed()
          .setColor(0x00aaff)
          .setTitle("🌧️ You were rained on!")
          .setDescription(
            `<@${message.author.id}> rained **${formattedPer} ${tokenSymbol}** on ${chain.emoji} **${chain.name}** ${networkLabel}`,
          )
          .setFooter({ text: `Use ${PREFIX}balance to check your balance · Crypto` }),
      ]).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// AIRDROP
// ---------------------------------------------------------------------------

async function handleAirdrop(message: Message, args: string[]): Promise<void> {
  if (await isRateLimited(message, "airdrop")) return;

  const amountStr = args[0];
  const tokenRaw = args[1];
  // Smart parse: detect which of args[2]/args[3] is slots (number) vs chain (string)
  let slotsStr: string | undefined;
  let chainArg: string | undefined;
  if (args.length >= 4) {
    const thirdIsNum = !isNaN(parseInt(args[2], 10));
    slotsStr = thirdIsNum ? args[2] : args[3];
    chainArg = thirdIsNum ? args[3] : args[2];
  } else {
    slotsStr = args[2];
    chainArg = undefined;
  }

  if (!amountStr || !tokenRaw || !slotsStr) {
    await message.reply({ embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.airdrop.usage}\``)] });
    return;
  }

  if (!message.guild) {
    await message.reply({ embeds: [errorEmbed("This command can only be used in servers")] });
    return;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    await message.reply({ embeds: [errorEmbed("Invalid amount")] });
    return;
  }

  const slots = parseInt(slotsStr, 10);
  if (isNaN(slots) || slots < 1 || slots > LIMITS.maxAirdropSlots) {
    await message.reply({
      embeds: [errorEmbed(`Slots must be between 1 and ${LIMITS.maxAirdropSlots}`)],
    });
    return;
  }

  const tokenSymbol = tokenRaw.toUpperCase();
  const chainId = chainArg?.toLowerCase() || "ethereum";

  if (!CHAIN_IDS.includes(chainId)) {
    await message.reply({
      embeds: [errorEmbed(`Unknown chain \`${chainId}\`. Valid: ${CHAIN_IDS.join(", ")}`)],
    });
    return;
  }

  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const chain = getChain(chainId);

  let token = "native";
  let decimals = chain.nativeDecimals;
  if (tokenSymbol !== chain.nativeToken) {
    const tokenInfo = findToken(tokenSymbol, chainId);
    if (!tokenInfo) {
      await message.reply({
        embeds: [errorEmbed(`Token ${tokenSymbol} not found on ${chain.name}`)],
      });
      return;
    }
    token = tokenInfo.contractAddress;
    decimals = tokenInfo.decimals;
  }

  const rawAmount = parseTokenAmount(amountStr, decimals).toString();
  const result = await createAirdrop(
    message.author.id,
    message.guild.id,
    message.channel.id,
    rawAmount,
    tokenSymbol,
    chainId,
    token,
    slots,
    isTestnet,
  );

  if (!result.success) {
    await message.reply({ embeds: [errorEmbed(result.error!)] });
    return;
  }

  recordUsage(message.author.id, "airdrop");

  const expiresAt = new Date(Date.now() + LIMITS.airdropExpiryMinutes * 60 * 1000);

  const sentMsg = await message.reply({
    embeds: [
      airdropEmbed({
        creatorTag: message.author.displayName,
        totalAmount: result.totalAmount,
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

  await airdropRepo.updateAirdropMessage(result.airdropId!, sentMsg.id);

  // Log to guild channel
  const airdropNetworkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;
  logToChannel(message.guild?.id, [
    brandEmbed()
      .setColor(0xf5a623)
      .setTitle("🪂 Airdrop Started")
      .setDescription(
        `<@${message.author.id}> started an airdrop of **${formatTokenAmount(result.totalAmount, decimals)} ${tokenSymbol}** on ${chain.emoji} ${chain.name}`,
      )
      .addFields({ name: "Slots", value: `${result.maxClaims}`, inline: true })
      .setFooter({ text: airdropNetworkLabel }),
  ]).catch(() => {});

  const collector = sentMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: LIMITS.airdropExpiryMinutes * 60 * 1000,
  });

  collector.on("collect", async (btnInteraction: ButtonInteraction) => {
    if (!btnInteraction.customId.startsWith("airdrop_claim:")) return;
    await btnInteraction.deferReply({ ephemeral: true });

    const claimResult = await claimAirdrop(result.airdropId!, btnInteraction.user.id, isTestnet);

    if (!claimResult.success) {
      await btnInteraction.editReply({ embeds: [errorEmbed(claimResult.error!)] });
      return;
    }

    const claimedFormatted = formatTokenAmount(claimResult.amount!, decimals);
    await btnInteraction.editReply({
      embeds: [
        successEmbed(
          "Airdrop Claimed!",
          `You received **${claimedFormatted} ${tokenSymbol}** ${chain.emoji}`,
        ),
      ],
    });

    // DM the claimer if they have notifications on
    dmUserIfEnabled(btnInteraction.user.id, [
      brandEmbed()
        .setColor(0x00ff88)
        .setTitle("🪂 Airdrop Claimed!")
        .setDescription(
          `You claimed **${claimedFormatted} ${tokenSymbol}** from an airdrop by **${message.author.displayName}** on ${chain.emoji} **${chain.name}**`,
        )
        .setFooter({ text: `Use ${PREFIX}balance to check your balance · Crypto` }),
    ]).catch(() => {});

    // Update the airdrop embed with new claim count
    const airdrop = await airdropRepo.getAirdrop(result.airdropId!);
    if (airdrop) {
      const claimCount = airdrop.claims.length;
      await sentMsg
        .edit({
          embeds: [
            airdropEmbed({
              creatorTag: message.author.displayName,
              totalAmount: result.totalAmount,
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
        })
        .catch(() => {});
    }
  });

  collector.on("end", async () => {
    await sentMsg.edit({ components: [] }).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// LEADERBOARD
// ---------------------------------------------------------------------------

async function handleLeaderboard(message: Message, args: string[]): Promise<void> {
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";

  // Parse args: optional token symbol, optional "tips" mode
  // e.g. $leaderboard | $leaderboard tips | $leaderboard eth | $leaderboard eth tips
  const KNOWN_TOKENS = new Set(["ETH", "SOL", "AVAX", "POL", "MATIC", "ARB", "OP", "USDC", "USDT", "DAI", "LINK", "WETH", "LTC", "BTC"]);
  let tokenFilter: string | null = null;
  let tipsMode = false;
  let limit = 10;

  for (const arg of args) {
    const upper = arg.toUpperCase();
    if (upper === "TIPS") { tipsMode = true; continue; }
    if (KNOWN_TOKENS.has(upper)) { tokenFilter = upper; continue; }
    const parsed = parseInt(arg, 10);
    if (!isNaN(parsed) && parsed > 0) { limit = Math.min(parsed, 25); continue; }
  }

  let entries = tipsMode
    ? await getLeaderboardTips(isTestnet, tokenFilter, limit * 3)
    : await getLeaderboardUSD(isTestnet, tokenFilter, limit * 3);

  // Filter by guild membership context
  if (message.guild) {
    // In a server: only show members currently in this guild
    const guild = message.guild;
    const filtered = [];
    for (const e of entries) {
      try {
        await guild.members.fetch(e.discordId);
        filtered.push(e);
      } catch {
        // not in this guild
      }
      if (filtered.length >= limit) break;
    }
    entries = filtered;
  } else if (activeClient) {
    // In DMs: only show users who share at least one guild with the caller
    const mutualGuildIds = activeClient.guilds.cache
      .filter((g) => g.members.cache.has(message.author.id))
      .map((g) => g.id);
    const filtered = [];
    for (const e of entries) {
      const isMutual = mutualGuildIds.some((gId) => {
        const g = activeClient!.guilds.cache.get(gId);
        return g?.members.cache.has(e.discordId);
      });
      if (isMutual) filtered.push(e);
      if (filtered.length >= limit) break;
    }
    entries = filtered;
  } else {
    entries = entries.slice(0, limit);
  }

  // Re-rank after filtering
  entries = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  const networkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;
  const filterLabel = tokenFilter ? `${tokenFilter} only` : "all tokens";
  const modeLabel = tipsMode ? "tip count" : "USD sent";
  const subtitle = `${networkLabel} · ${filterLabel} · sorted by ${modeLabel}`;

  if (entries.length === 0) {
    await message.reply({
      embeds: [
        brandEmbed()
          .setTitle(`${EMOJIS.leaderboard} Leaderboard`)
          .setDescription(`No tips recorded yet.\n${subtitle}`),
      ],
    });
    return;
  }

  const lines = entries.map((e) => {
    const medal = MEDALS[e.rank - 1] || `**#${e.rank}**`;
    if (tipsMode) {
      return `${medal} <@${e.discordId}>  **${e.totalTips}** tips  *(${e.totalAmount})*`;
    }
    return `${medal} <@${e.discordId}>  **${e.totalAmount}**  *(${e.totalTips} tips)*`;
  });

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.leaderboard} Top Tippers`)
        .setDescription(lines.join("\n"))
        .setFooter({ text: subtitle }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Crypto overview
// ---------------------------------------------------------------------------

async function handleCrypto(message: Message): Promise<void> {
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const networkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  // Fetch stats
  const { prisma } = await import("../../database/client.js");
  const [userCount, walletCount, mainnetTxns, testnetTxns] = await Promise.all([
    prisma.user.count(),
    prisma.wallet.count(),
    prisma.transaction.count({ where: { isTestnet: false, status: "completed" } }),
    prisma.transaction.count({ where: { isTestnet: true, status: "completed" } }),
  ]);

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`${BRAND.name}`)
        .setDescription(
          `Instant crypto tipping across 9 networks.\n\n` +
            `**Your network:** ${networkLabel}\n` +
            `Type \`${PREFIX}network mainnet\` or \`${PREFIX}network testnet\` to switch.`,
        )
        .addFields(
          { name: "👥 Users", value: `**${userCount.toLocaleString()}**`, inline: true },
          { name: "👛 Wallets", value: `**${walletCount.toLocaleString()}**`, inline: true },
          { name: "📦 Transactions", value: `**${(mainnetTxns + testnetTxns).toLocaleString()}**`, inline: true },
          {
            name: "Chains",
            value: "ETH · Polygon · Arbitrum · Optimism · Base · zkSync · Avalanche · Solana",
            inline: false,
          },
        )
        .setFooter({ text: `${BRAND.name} · Use ${PREFIX}help for all commands` }),
    ],
    components: [hodlrMenuRow1(), hodlrMenuRow2()],
  });
}

// ---------------------------------------------------------------------------
// CONFIG overview
// ---------------------------------------------------------------------------

async function handleConfig(message: Message): Promise<void> {
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const networkLabel = isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  const dmEnabled = await userRepo.isDmEnabled(message.author.id);

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`⚙️ Your Settings`)
        .addFields(
          { name: "Network", value: networkLabel, inline: true },
          { name: "DM Notifications", value: dmEnabled ? "On" : "Off", inline: true },
          { name: "User ID", value: `\`${message.author.id}\``, inline: false },
          {
            name: "Commands",
            value:
              `\`${PREFIX}network mainnet|testnet\` — switch network\n` +
              `\`${PREFIX}notifications on|off\` — toggle DM notifications\n` +
              `\`${PREFIX}privatekey\` — secure encrypted recovery dashboard`,
            inline: false,
          },
        )
        .setFooter({ text: `Crypto` }),
    ],
  });
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS — opt-in/out for DMs
// ---------------------------------------------------------------------------

async function handleNotifications(message: Message, args: string[]): Promise<void> {
  const mode = args[0]?.toLowerCase();

  if (!mode) {
    const enabled = await userRepo.isDmEnabled(message.author.id);
    await message.reply({
      embeds: [
        brandEmbed()
          .setTitle("🔔 DM Notifications")
          .setDescription(
            `DM notifications are currently **${enabled ? "on" : "off"}**.\n` +
              `Use \`${PREFIX}notifications on\` or \`${PREFIX}notifications off\` to change this.`,
          ),
      ],
    });
    return;
  }

  if (mode !== "on" && mode !== "off") {
    await message.reply({ embeds: [errorEmbed("Use `on` or `off`")] });
    return;
  }

  const enabled = mode === "on";
  await userRepo.setDmEnabled(message.author.id, enabled);

  await message.reply({
    embeds: [
      successEmbed(
        "Notifications Updated",
        enabled
          ? "DM notifications are now **on**. You will be notified when you receive tips, rain, airdrops, and deposits."
          : "DM notifications are now **off**. You will no longer receive DM alerts.",
      ),
    ],
  });
}

// ---------------------------------------------------------------------------
// PRIVATE KEY — legacy command safely redirects to the encrypted recovery flow.
async function handlePrivateKey(message: Message, _args: string[]): Promise<void> {
  const base = config.dashboard.baseUrl;
  if (!base) {
    await message.reply({ embeds: [errorEmbed("Direct private-key export through Discord is disabled. The operator must configure the secure Crypto dashboard first.")] });
    return;
  }
  await message.reply({
    embeds: [brandEmbed().setTitle("Secure wallet recovery")
      .setDescription(`Crypto never sends raw private keys in Discord messages. Sign in via identify-only Discord OAuth at ${base}/auth/discord, create a one-time recovery key, and download an encrypted wallet backup. Decrypt it locally at ${base}/recover.`)],
  });
}
