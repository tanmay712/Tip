import { EmbedBuilder } from "discord.js";
import { getChain, getExplorerTxUrl, getExplorerAddressUrl } from "../../blockchain/chains.js";
import { BRAND, EMOJIS } from "../../utils/constants.js";
import { truncateAddress, formatTokenAmount } from "../../utils/format.js";

export function brandEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND.color)
    .setThumbnail(BRAND.icon)
    .setFooter({ text: `${BRAND.name} — ${BRAND.tagline}` })
    .setTimestamp();
}

export function chainEmbed(chainId: string): EmbedBuilder {
  const chain = getChain(chainId);
  return new EmbedBuilder()
    .setColor(chain.color)
    .setThumbnail(BRAND.icon)
    .setFooter({ text: `${chain.emoji} ${chain.name} — ${BRAND.name}` })
    .setTimestamp();
}

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
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.tip} Tip Sent!`)
    .setDescription(
      `**${params.senderTag}** tipped **${params.receiverTag}**`,
    )
    .addFields(
      {
        name: "Amount",
        value: `${formatTokenAmount(params.amount, params.decimals)} ${params.tokenSymbol}`,
        inline: true,
      },
      { name: "Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "Network", value: networkLabel, inline: true },
    );
}

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
  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.rain} Rain!`)
    .setDescription(
      `**${params.senderTag}** made it rain on **${params.recipients}** users!`,
    )
    .addFields(
      {
        name: "Total",
        value: `${formatTokenAmount(params.totalAmount, params.decimals)} ${params.tokenSymbol}`,
        inline: true,
      },
      {
        name: "Per User",
        value: `${formatTokenAmount(params.perUser, params.decimals)} ${params.tokenSymbol}`,
        inline: true,
      },
      { name: "Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
    );
}

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

  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.airdrop} Airdrop!`)
    .setDescription(
      `**${params.creatorTag}** started an airdrop! Click the button to claim.`,
    )
    .addFields(
      {
        name: "Per Claim",
        value: `${formatTokenAmount(params.perClaim, params.decimals)} ${params.tokenSymbol}`,
        inline: true,
      },
      {
        name: "Slots",
        value: `${remaining}/${params.maxClaims} remaining`,
        inline: true,
      },
      { name: "Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      {
        name: "Expires",
        value: `<t:${Math.floor(params.expiresAt.getTime() / 1000)}:R>`,
        inline: true,
      },
    );
}

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
    .addFields(
      { name: "Address", value: `\`${params.address}\``, inline: false },
      { name: "Network", value: networkLabel, inline: true },
      { name: "Explorer", value: `[View on Explorer](${explorerUrl})`, inline: true },
    );
}

export function balanceEmbed(params: {
  chainId: string;
  balances: Array<{ symbol: string; amount: string; decimals: number }>;
  isTestnet: boolean;
}): EmbedBuilder {
  const chain = getChain(params.chainId);
  const networkLabel = params.isTestnet ? `${EMOJIS.testnet} Testnet` : `${EMOJIS.mainnet} Mainnet`;

  const embed = chainEmbed(params.chainId)
    .setTitle(`${chain.emoji} ${chain.name} Balance`)
    .addFields({
      name: "Network",
      value: networkLabel,
      inline: false,
    });

  for (const b of params.balances) {
    embed.addFields({
      name: b.symbol,
      value: formatTokenAmount(b.amount, b.decimals),
      inline: true,
    });
  }

  if (params.balances.length === 0) {
    embed.setDescription("No balances found");
  }

  return embed;
}

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

  return chainEmbed(params.chainId)
    .setTitle(`${EMOJIS.withdraw} Withdrawal Sent`)
    .addFields(
      {
        name: "Amount",
        value: `${formatTokenAmount(params.amount, params.decimals)} ${params.tokenSymbol}`,
        inline: true,
      },
      { name: "To", value: `\`${truncateAddress(params.toAddress)}\``, inline: true },
      { name: "Chain", value: `${chain.emoji} ${chain.name}`, inline: true },
      { name: "Transaction", value: `[View on Explorer](${txUrl})`, inline: false },
    );
}

export function errorEmbed(message: string): EmbedBuilder {
  return brandEmbed()
    .setColor(0xff4444)
    .setTitle(`${EMOJIS.error} Error`)
    .setDescription(message);
}

export function successEmbed(title: string, message: string): EmbedBuilder {
  return brandEmbed()
    .setTitle(`${EMOJIS.success} ${title}`)
    .setDescription(message);
}
