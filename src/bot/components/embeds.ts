import { EmbedBuilder } from "discord.js";
import { getChain, getExplorerTxUrl, getExplorerAddressUrl } from "../../blockchain/chains.js";
import { BRAND, EMOJIS } from "../../utils/constants.js";
import { truncateAddress, formatTokenAmount } from "../../utils/format.js";

// ---------------------------------------------------------------------------
// Base embeds
// ---------------------------------------------------------------------------

export function brandEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND.color)
    .setAuthor({ name: BRAND.name, iconURL: BRAND.icon })
    .setFooter({ text: `${BRAND.name} — ${BRAND.tagline}` })
    .setTimestamp();
}

export function chainEmbed(chainId: string): EmbedBuilder {
  const chain = getChain(chainId);
  return new EmbedBuilder()
    .setColor(chain.color)
    .setAuthor({ name: `${BRAND.name} · ${chain.name}`, iconURL: BRAND.icon })
    .setFooter({ text: `${chain.emoji} ${chain.name} · ${BRAND.name}` })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Tip embed
// ---------------------------------------------------------------------------

export function tipEmbed(params: {
  senderTag: string;
  receiverTag: string;
  amount: string;
  decimals: number;
  tokenSymbol: string;
  chainId: string;
  isTestnet: boolean;
}): EmbedBuilder {
  const chain = getChain(params.chainId);
  const formatted = formatTokenAmount(params.amount, params.decimals);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.tip} Tip Sent!`)
    .setDescription(
      `> **${params.senderTag}** tipped **${params.receiverTag}** **${formatted} ${params.tokenSymbol}** on ${chain.emoji} ${chain.name}`,
    )
    .addFields(
      {
        name: "💰 Amount",
        value: `\`${formatted} ${params.tokenSymbol}\``,
        inline: true,
      },
      { name: "⛓️ Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "🌐 Network", value: networkLabel, inline: true },
    );
}

// ---------------------------------------------------------------------------
// Rain embed
// ---------------------------------------------------------------------------

export function rainEmbed(params: {
  senderTag: string;
  totalAmount: string;
  perUser: string;
  decimals: number;
  tokenSymbol: string;
  recipients: number;
  chainId: string;
  isTestnet: boolean;
}): EmbedBuilder {
  const chain = getChain(params.chainId);
  const total = formatTokenAmount(params.totalAmount, params.decimals);
  const perUser = formatTokenAmount(params.perUser, params.decimals);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.rain} It's Raining ${params.tokenSymbol}!`)
    .setDescription(
      `> **${params.senderTag}** made it rain **${total} ${params.tokenSymbol}** on **${params.recipients}** lucky members!`,
    )
    .addFields(
      {
        name: "💰 Total",
        value: `\`${total} ${params.tokenSymbol}\``,
        inline: true,
      },
      {
        name: "👤 Per User",
        value: `\`${perUser} ${params.tokenSymbol}\``,
        inline: true,
      },
      { name: "👥 Recipients", value: `**${params.recipients}**`, inline: true },
      { name: "⛓️ Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "🌐 Network", value: networkLabel, inline: true },
    );
}

// ---------------------------------------------------------------------------
// Airdrop embed
// ---------------------------------------------------------------------------

export function airdropEmbed(params: {
  creatorTag: string;
  totalAmount: string;
  perClaim: string;
  decimals: number;
  tokenSymbol: string;
  maxClaims: number;
  currentClaims: number;
  chainId: string;
  isTestnet: boolean;
  expiresAt: Date;
}): EmbedBuilder {
  const chain = getChain(params.chainId);
  const remaining = params.maxClaims - params.currentClaims;
  const perClaim = formatTokenAmount(params.perClaim, params.decimals);
  const total = formatTokenAmount(params.totalAmount, params.decimals);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;
  const progress = buildProgressBar(params.currentClaims, params.maxClaims);

  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.airdrop} Airdrop — ${total} ${params.tokenSymbol}!`)
    .setDescription(
      `> **${params.creatorTag}** started an airdrop!\n` +
        `> Click the button below to claim your share.\n\n` +
        `${progress}  **${remaining}/${params.maxClaims}** slots remaining`,
    )
    .addFields(
      {
        name: "🎁 Per Claim",
        value: `\`${perClaim} ${params.tokenSymbol}\``,
        inline: true,
      },
      {
        name: "⏰ Expires",
        value: `<t:${Math.floor(params.expiresAt.getTime() / 1000)}:R>`,
        inline: true,
      },
      { name: "⛓️ Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "🌐 Network", value: networkLabel, inline: true },
    );
}

function buildProgressBar(current: number, max: number, length = 10): string {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return `${"▓".repeat(filled)}${"░".repeat(empty)}`;
}

// ---------------------------------------------------------------------------
// Wallet / Deposit embed
// ---------------------------------------------------------------------------

export function walletEmbed(params: {
  chain: string;
  address: string;
  isTestnet: boolean;
}): EmbedBuilder {
  const chain = getChain(params.chain);
  const explorerUrl = getExplorerAddressUrl(params.chain, params.address, params.isTestnet);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  return chainEmbed(params.chain)
    .setTitle(`${EMOJIS.wallet} ${chain.name} Wallet`)
    .setDescription(
      `Send **${chain.nativeToken}** or any supported token to this address to deposit.`,
    )
    .addFields(
      { name: "📬 Address", value: `\`\`\`\n${params.address}\n\`\`\``, inline: false },
      { name: "🌐 Network", value: networkLabel, inline: true },
      { name: "🔍 Explorer", value: `[View on Explorer](${explorerUrl})`, inline: true },
    );
}

export function depositEmbed(params: {
  chain: string;
  address: string;
  isTestnet: boolean;
}): EmbedBuilder {
  const chain = getChain(params.chain);
  const explorerUrl = getExplorerAddressUrl(params.chain, params.address, params.isTestnet);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  return chainEmbed(params.chain)
    .setTitle(`${EMOJIS.deposit} Deposit Address — ${chain.name}`)
    .setDescription(
      `Send **${chain.nativeToken}** or any supported token to the address below.\n` +
        `Your balance will be credited automatically once the transaction is confirmed.`,
    )
    .addFields(
      { name: "📬 Deposit Address", value: `\`\`\`\n${params.address}\n\`\`\``, inline: false },
      { name: "🌐 Network", value: networkLabel, inline: true },
      { name: "⛓️ Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "🔍 Explorer", value: `[View on Explorer](${explorerUrl})`, inline: false },
    )
    .setFooter({ text: `Deposits are detected automatically · ${BRAND.name}` });
}

// ---------------------------------------------------------------------------
// Balance embed
// ---------------------------------------------------------------------------

export function balanceEmbed(params: {
  chainId: string;
  balances: Array<{ symbol: string; amount: string; decimals: number }>;
  isTestnet: boolean;
}): EmbedBuilder {
  const chain = getChain(params.chainId);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  const embed = chainEmbed(params.chainId)
    .setTitle(`${chain.emoji} ${chain.name} Balance`)
    .addFields({ name: "🌐 Network", value: networkLabel, inline: true });

  if (params.balances.length === 0) {
    embed.addFields({
      name: "No balances found",
      value: "Deposit some crypto to get started!",
      inline: false,
    });
  } else {
    for (const b of params.balances) {
      const formatted = formatTokenAmount(b.amount, b.decimals);
      embed.addFields({
        name: `💰 ${b.symbol}`,
        value: `\`${formatted}\``,
        inline: true,
      });
    }
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Withdraw embed
// ---------------------------------------------------------------------------

export function withdrawEmbed(params: {
  chainId: string;
  txHash: string;
  amount: string;
  decimals: number;
  tokenSymbol: string;
  toAddress: string;
  isTestnet: boolean;
}): EmbedBuilder {
  const chain = getChain(params.chainId);
  const txUrl = getExplorerTxUrl(params.chainId, params.txHash, params.isTestnet);
  const formatted = formatTokenAmount(params.amount, params.decimals);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.withdraw} Withdrawal Sent!`)
    .setDescription(
      `> Your withdrawal has been broadcast and confirmed on ${chain.emoji} **${chain.name}**.`,
    )
    .addFields(
      {
        name: "💸 Amount",
        value: `\`${formatted} ${params.tokenSymbol}\``,
        inline: true,
      },
      {
        name: "📮 Destination",
        value: `\`${truncateAddress(params.toAddress)}\``,
        inline: true,
      },
      { name: "⛓️ Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "🌐 Network", value: networkLabel, inline: true },
      {
        name: "🔗 Transaction",
        value: `[View on Explorer](${txUrl})\n\`${params.txHash.slice(0, 20)}…\``,
        inline: false,
      },
    );
}

// ---------------------------------------------------------------------------
// Error / Success embeds
// ---------------------------------------------------------------------------

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setAuthor({ name: `${BRAND.name} — Error`, iconURL: BRAND.icon })
    .setTitle(`${EMOJIS.error} Something went wrong`)
    .setDescription(message)
    .setTimestamp()
    .setFooter({ text: BRAND.name });
}

export function successEmbed(title: string, message: string): EmbedBuilder {
  return brandEmbed()
    .setColor(0x00ff88)
    .setTitle(`${EMOJIS.success} ${title}`)
    .setDescription(message);
}
