import { type Message, type GuildMember } from "discord.js";
import { CHAIN_IDS, getChain } from "../../blockchain/chains.js";
import { findToken } from "../../blockchain/tokens.js";
import * as userRepo from "../../database/repositories/user.repo.js";
import * as txRepo from "../../database/repositories/transaction.repo.js";
import { getOrCreateWallet, getAllWallets } from "../../core/wallet.service.js";
import { sendTip } from "../../core/tip.service.js";
import { sendRain } from "../../core/rain.service.js";
import { getLeaderboard } from "../../core/leaderboard.service.js";
import { getPrice } from "../../core/price.service.js";
import * as alchemyApi from "../../blockchain/alchemy.js";
import { getSolBalance } from "../../blockchain/solana.js";
import { parseTokenAmount, formatTokenAmount, formatUsd } from "../../utils/format.js";
import {
  tipEmbed,
  rainEmbed,
  balanceEmbed,
  errorEmbed,
  successEmbed,
  brandEmbed,
  walletEmbed,
} from "../components/embeds.js";
import { BRAND, EMOJIS, PREFIX, LIMITS } from "../../utils/constants.js";

const MEDALS = ["🥇", "🥈", "🥉"];

const COMMAND_HELP: Record<string, { usage: string; description: string }> = {
  tip: {
    usage: `${PREFIX}tip @user <amount> <token> [chain]`,
    description:
      "Send an instant off-chain tip to another user. Example: `!tip @alice 0.01 ETH`",
  },
  rain: {
    usage: `${PREFIX}rain <amount> <token> [chain]`,
    description: "Distribute tokens evenly among recent active members.",
  },
  balance: {
    usage: `${PREFIX}balance [chain]`,
    description: "Check your token balances. Specify a chain for a detailed view.",
  },
  wallet: {
    usage: `${PREFIX}wallet [deposit <chain>]`,
    description: "View your wallets or get a deposit address for a specific chain.",
  },
  network: {
    usage: `${PREFIX}network [mainnet|testnet]`,
    description: "View or switch your network setting.",
  },
  price: {
    usage: `${PREFIX}price <token>`,
    description: "Check the current USD price and 24h change for a token.",
  },
  leaderboard: {
    usage: `${PREFIX}leaderboard [limit]`,
    description: "See the top tippers in the community.",
  },
};

export async function handlePrefixCommand(message: Message): Promise<void> {
  const content = message.content.slice(PREFIX.length).trim();
  if (!content) return;

  const parts = content.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case "help":        return handleHelp(message, args);
    case "tip":         return handleTip(message, args);
    case "balance":     return handleBalance(message, args);
    case "network":     return handleNetwork(message, args);
    case "price":       return handlePrice(message, args);
    case "wallet":      return handleWallet(message, args);
    case "rain":        return handleRain(message, args);
    case "leaderboard": return handleLeaderboard(message, args);
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

// ─── Help ────────────────────────────────────────────────────────────────────

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
    return `${ch.emoji} ${ch.name} (${ch.nativeToken})`;
  }).join("\n");

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`${BRAND.name} — ${BRAND.tagline}`)
        .setDescription(
          `A modern crypto tipping bot. Use \`${PREFIX}<command>\` or slash commands.`,
        )
        .addFields(
          { name: `${EMOJIS.tip} Tipping`,   value: `\`${PREFIX}tip\` \`${PREFIX}rain\``, inline: true },
          { name: `${EMOJIS.wallet} Wallet`,  value: `\`${PREFIX}wallet\` \`${PREFIX}balance\``, inline: true },
          { name: `${EMOJIS.history} Info`,   value: `\`${PREFIX}leaderboard\` \`${PREFIX}price\``, inline: true },
          { name: `${EMOJIS.network} Settings`, value: `\`${PREFIX}network\` \`${PREFIX}help\``, inline: true },
          { name: "Supported Chains", value: chainList, inline: false },
        ),
    ],
  });
}

// ─── Tip ─────────────────────────────────────────────────────────────────────

async function handleTip(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.users.first();
  if (!target) {
    await message.reply({
      embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.tip.usage}\``)],
    });
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ embeds: [errorEmbed("You can't tip yourself!")] });
    return;
  }
  if (target.bot) {
    await message.reply({ embeds: [errorEmbed("You can't tip bots!")] });
    return;
  }

  // Strip mention tokens so remaining args are: amount, token, [chain]
  const nonMentionArgs = args.filter((a) => !a.match(/^<@!?\d+>$/));
  const [amountStr, tokenRaw, chainArg] = nonMentionArgs;

  if (!amountStr || !tokenRaw) {
    await message.reply({
      embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.tip.usage}\``)],
    });
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
  const result = await sendTip(
    message.author.id,
    target.id,
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

  await message.reply({
    embeds: [
      tipEmbed({
        senderTag: message.author.displayName,
        receiverTag: target.displayName,
        amount: rawAmount,
        decimals,
        tokenSymbol,
        chainId,
        isTestnet,
      }),
    ],
  });

  try {
    await target.send({
      embeds: [
        tipEmbed({
          senderTag: message.author.displayName,
          receiverTag: "you",
          amount: rawAmount,
          decimals,
          tokenSymbol,
          chainId,
          isTestnet,
        }).setFooter({ text: `Use ${PREFIX}balance to check your balance` }),
      ],
    });
  } catch {
    // Recipient has DMs disabled
  }
}

// ─── Balance ─────────────────────────────────────────────────────────────────

async function handleBalance(message: Message, args: string[]): Promise<void> {
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const specificChain = args[0]?.toLowerCase();

  if (specificChain && !CHAIN_IDS.includes(specificChain)) {
    await message.reply({
      embeds: [errorEmbed(`Unknown chain \`${specificChain}\`. Valid: ${CHAIN_IDS.join(", ")}`)],
    });
    return;
  }

  const user = await userRepo.findOrCreateUser(message.author.id);

  if (specificChain) {
    const chain = getChain(specificChain);
    const { address } = await getOrCreateWallet(message.author.id, specificChain, isTestnet);
    const balances: Array<{ symbol: string; amount: string; decimals: number }> = [];

    let nativeBalance: string;
    if (chain.type === "solana") {
      nativeBalance = await getSolBalance(address, isTestnet);
    } else {
      nativeBalance = await alchemyApi.getBalance(specificChain, address, isTestnet);
    }

    const internalBalance = await txRepo.getUserBalance(user.id, specificChain, "native", isTestnet);
    const totalNative = (BigInt(nativeBalance) + internalBalance).toString();
    balances.push({ symbol: chain.nativeToken, amount: totalNative, decimals: chain.nativeDecimals });

    if (chain.type === "evm") {
      try {
        const tokenBals = await alchemyApi.getTokenBalances(specificChain, address, isTestnet);
        for (const tb of tokenBals) {
          const meta = await alchemyApi.getTokenMetadata(specificChain, tb.contractAddress, isTestnet);
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
    // Summary view — show internal (tip/rain) balances across all chains
    const embed = brandEmbed()
      .setTitle(`${EMOJIS.wallet} All Balances`)
      .setDescription(isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`);

    let hasBalances = false;
    for (const chainId of CHAIN_IDS) {
      const chain = getChain(chainId);
      const internalBalance = await txRepo.getUserBalance(user.id, chainId, "native", isTestnet);
      if (internalBalance > 0n) {
        embed.addFields({
          name: `${chain.emoji} ${chain.name}`,
          value: `${formatTokenAmount(internalBalance.toString(), chain.nativeDecimals)} ${chain.nativeToken}`,
          inline: true,
        });
        hasBalances = true;
      }
    }

    if (!hasBalances) {
      embed.setDescription(
        `${embed.data.description}\n\nNo balances yet. Use \`${PREFIX}wallet deposit <chain>\` to get started!`,
      );
    }

    await message.reply({ embeds: [embed] });
  }
}

// ─── Network ─────────────────────────────────────────────────────────────────

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
    await message.reply({
      embeds: [errorEmbed(`Use \`mainnet\` or \`testnet\``)],
    });
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

// ─── Price ───────────────────────────────────────────────────────────────────

async function handlePrice(message: Message, args: string[]): Promise<void> {
  const symbol = args[0]?.toUpperCase();
  if (!symbol) {
    await message.reply({
      embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.price.usage}\``)],
    });
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
          { name: "Price", value: formatUsd(info.price), inline: true },
          { name: `${changeEmoji} 24h Change`, value: changeStr, inline: true },
        ),
    ],
  });
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

async function handleWallet(message: Message, args: string[]): Promise<void> {
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const sub = args[0]?.toLowerCase();

  if (sub === "deposit") {
    const chainId = args[1]?.toLowerCase();
    if (!chainId || !CHAIN_IDS.includes(chainId)) {
      await message.reply({
        embeds: [
          errorEmbed(
            `Specify a valid chain. Valid chains: ${CHAIN_IDS.join(", ")}`,
          ),
        ],
      });
      return;
    }
    const { address } = await getOrCreateWallet(message.author.id, chainId, isTestnet);
    const embed = walletEmbed({ chain: chainId, address, isTestnet });
    embed.setDescription(
      `Send ${getChain(chainId).nativeToken} or tokens to this address to deposit.`,
    );
    await message.reply({ embeds: [embed] });
    return;
  }

  // Default: show all wallets
  const wallets = await getAllWallets(message.author.id, isTestnet);
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

  await message.reply({ embeds: [embed] });
}

// ─── Rain ────────────────────────────────────────────────────────────────────

async function handleRain(message: Message, args: string[]): Promise<void> {
  const [amountStr, tokenRaw, chainArg] = args;
  if (!amountStr || !tokenRaw) {
    await message.reply({
      embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.rain.usage}\``)],
    });
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
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

async function handleLeaderboard(message: Message, args: string[]): Promise<void> {
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const limit = Math.min(Math.max(parseInt(args[0] || "10", 10) || 10, 1), 25);

  const entries = await getLeaderboard(isTestnet, limit);

  if (entries.length === 0) {
    await message.reply({
      embeds: [
        brandEmbed()
          .setTitle(`${EMOJIS.leaderboard} Leaderboard`)
          .setDescription("No tips recorded yet. Be the first!"),
      ],
    });
    return;
  }

  const lines = entries.map((e) => {
    const medal = MEDALS[e.rank - 1] || `**#${e.rank}**`;
    return `${medal} <@${e.discordId}> — **${e.totalTips}** tips sent`;
  });

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`${EMOJIS.leaderboard} Top Tippers`)
        .setDescription(lines.join("\n"))
        .setFooter({
          text: isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`,
        }),
    ],
  });
}
