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
import { sendTip } from "../../core/tip.service.js";
import { sendRain } from "../../core/rain.service.js";
import { getLeaderboard, getLeaderboardUSD, getLeaderboardTips } from "../../core/leaderboard.service.js";
import { getPrice, getPrices } from "../../core/price.service.js";
import { withdraw } from "../../core/withdraw.service.js";
import { createAirdrop, claimAirdrop } from "../../core/airdrop.service.js";
import * as alchemyApi from "../../blockchain/alchemy.js";
import { getSolBalance } from "../../blockchain/solana.js";
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
} from "../components/buttons.js";
import { BRAND, EMOJIS, PREFIX, LIMITS } from "../../utils/constants.js";

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
  hodlr: {
    usage: `${PREFIX}hodlr`,
    description: "Bot overview, stats, and quick-action buttons.",
  },
};

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

  // Check if user is banned (skip admin commands so admins can unban)
  if (cmd !== "admin") {
    try {
      const banned = await configRepo.isUserBanned(message.author.id);
      if (banned) {
        await message.reply({ embeds: [errorEmbed("You have been banned from using Hodlr.")] });
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
    case "hodlr":       return handleHodlr(message);
    case "config":      return handleConfig(message);
    // admin
    case "admin":       return handleAdminCommand(message, args);
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
            value: `\`${PREFIX}leaderboard\`  \`${PREFIX}price\`  \`${PREFIX}hodlr\``,
            inline: false,
          },
          {
            name: `⚙️ Settings`,
            value: `\`${PREFIX}network\`  \`${PREFIX}config\``,
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
  const target = message.mentions.users.first();
  if (!target) {
    await message.reply({ embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.tip.usage}\``)] });
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

  const nonMentionArgs = args.filter((a) => !a.match(/^<@!?\d+>$/));
  const [amountStr, tokenRaw, chainArg] = nonMentionArgs;

  if (!amountStr || !tokenRaw) {
    await message.reply({ embeds: [errorEmbed(`Usage: \`${COMMAND_HELP.tip.usage}\``)] });
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
    decimals,
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
    components: [tipActionRow()],
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
        }).setFooter({ text: `Check your balance with ${PREFIX}balance · Hodlr` }),
      ],
      components: [tipActionRow()],
    });
  } catch {
    // DMs disabled
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
    const { address } = await getOrCreateWallet(message.author.id, specificChain, isTestnet);
    const balances: Array<{ symbol: string; amount: string; decimals: number }> = [];

    let nativeBalance: string;
    if (chain.type === "solana") {
      nativeBalance = await getSolBalance(address, isTestnet);
    } else {
      nativeBalance = await alchemyApi.getBalance(specificChain, address, isTestnet);
    }

    const internalBalance = await txRepo.getUserBalance(
      user.id,
      specificChain,
      "native",
      isTestnet,
    );
    const totalNative = (BigInt(nativeBalance) + internalBalance).toString();
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
        .setFooter({ text: "Powered by CoinGecko · Hodlr" }),
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

  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";
  const { address } = await getOrCreateWallet(message.author.id, chainId, isTestnet);

  const embed = depositEmbed({ chain: chainId, address, isTestnet });

  if (shouldRedirect) {
    await message.author
      .send({ embeds: [embed], components: [depositActionRow()] })
      .catch(() => {});
  } else {
    await message.reply({ embeds: [embed], components: [depositActionRow()] });
  }
}

// ---------------------------------------------------------------------------
// WITHDRAW — core flow (used by $wallet withdraw and $withdraw alias)
// ---------------------------------------------------------------------------

async function handleWithdrawFlow(message: Message, args: string[]): Promise<void> {
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

  if (chain.type === "solana") {
    try {
      new PublicKey(toAddress);
    } catch {
      const errEmbed = errorEmbed("Invalid Solana address");
      if (shouldRedirect) {
        await message.author.send({ embeds: [errEmbed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [errEmbed] });
      }
      return;
    }
  } else {
    if (!ethers.isAddress(toAddress)) {
      const errEmbed = errorEmbed("Invalid EVM address");
      if (shouldRedirect) {
        await message.author.send({ embeds: [errEmbed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [errEmbed] });
      }
      return;
    }
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
  const network = await userRepo.getUserNetwork(message.author.id);
  const isTestnet = network === "testnet";

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

  const resultEmbed = withdrawEmbed({
    chainId,
    txHash: result.txHash!,
    amount: rawAmount,
    decimals,
    tokenSymbol,
    toAddress,
    isTestnet,
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

// ---------------------------------------------------------------------------
// AIRDROP
// ---------------------------------------------------------------------------

async function handleAirdrop(message: Message, args: string[]): Promise<void> {
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

    await btnInteraction.editReply({
      embeds: [
        successEmbed(
          "Airdrop Claimed!",
          `You received **${formatTokenAmount(claimResult.amount!, decimals)} ${tokenSymbol}** ${chain.emoji}`,
        ),
      ],
    });

    // Try to DM the claimer
    try {
      await btnInteraction.user.send({
        embeds: [
          successEmbed(
            "Airdrop Claimed!",
            `You claimed **${formatTokenAmount(claimResult.amount!, decimals)} ${tokenSymbol}** from an airdrop by **${message.author.displayName}**!`,
          ).setFooter({ text: `Use ${PREFIX}balance to check your balance · Hodlr` }),
        ],
      });
    } catch {
      // DMs disabled
    }

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
  const KNOWN_TOKENS = new Set(["ETH", "SOL", "AVAX", "POL", "MATIC", "ARB", "OP", "USDC", "USDT", "DAI", "LINK", "WETH", "BTC"]);
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

  const entries = tipsMode
    ? await getLeaderboardTips(isTestnet, tokenFilter, limit)
    : await getLeaderboardUSD(isTestnet, tokenFilter, limit);

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
// HODLR overview
// ---------------------------------------------------------------------------

async function handleHodlr(message: Message): Promise<void> {
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
          `Instant crypto tipping across 8 chains.\n\n` +
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

  const user = await userRepo.findOrCreateUser(message.author.id);

  await message.reply({
    embeds: [
      brandEmbed()
        .setTitle(`⚙️ Your Settings`)
        .addFields(
          { name: "Network", value: networkLabel, inline: true },
          { name: "User ID", value: `\`${message.author.id}\``, inline: true },
          {
            name: "Switch Network",
            value: `\`${PREFIX}network mainnet\` or \`${PREFIX}network testnet\``,
            inline: false,
          },
        )
        .setFooter({ text: `Hodlr` }),
    ],
  });
  void user;
}
