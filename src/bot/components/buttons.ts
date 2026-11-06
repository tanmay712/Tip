import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export function consentActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tipx:consent:accept").setLabel("Accept and continue").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tipx:consent:decline").setLabel("Decline").setStyle(ButtonStyle.Secondary),
  );
}

export function airdropClaimButton(
  airdropId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`airdrop_claim:${airdropId}`)
      .setLabel("Claim Airdrop")
      .setEmoji("🪂")
      .setStyle(ButtonStyle.Success),
  );
}

export function confirmCancelButtons(
  actionId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:${actionId}`)
      .setLabel("Confirm")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cancel:${actionId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );
}

export function paginationButtons(
  prefix: string,
  currentPage: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:prev:${currentPage}`)
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`${prefix}:page`)
      .setLabel(`${currentPage} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${prefix}:next:${currentPage}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages),
  );
}

export function tipActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tipx:balance")
      .setLabel("Balance")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tipx:leaderboard")
      .setLabel("Leaderboard")
      .setEmoji("🏆")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function depositActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tipx:balance")
      .setLabel("Check Balance")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("tipx:wallet")
      .setLabel("All Wallets")
      .setEmoji("👛")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function withdrawActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tipx:balance")
      .setLabel("Check Balance")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function hodlrMenuRow1(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tipx:balance")
      .setLabel("Balance")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("tipx:deposit")
      .setLabel("Deposit")
      .setEmoji("📥")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("tipx:withdraw_info")
      .setLabel("Withdraw")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Primary),
  );
}

export function hodlrMenuRow2(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tipx:tip_info")
      .setLabel("Tip")
      .setEmoji("💸")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tipx:leaderboard")
      .setLabel("Leaderboard")
      .setEmoji("🏆")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tipx:prices")
      .setLabel("Prices")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tipx:help")
      .setLabel("Help")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Secondary),
  );
}
