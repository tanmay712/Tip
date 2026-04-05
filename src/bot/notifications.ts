/**
 * Notification helpers — send DMs and log-channel messages via the active Discord client.
 */

import { type EmbedBuilder, type TextChannel } from "discord.js";
import { activeClient } from "./client.js";
import * as configRepo from "../database/repositories/config.repo.js";
import { logger } from "../utils/logger.js";

/** DM a user. Silently ignores if DMs are disabled or user not found. */
export async function dmUser(discordId: string, embeds: EmbedBuilder[]): Promise<void> {
  if (!activeClient) return;
  try {
    const user = await activeClient.users.fetch(discordId);
    await user.send({ embeds });
  } catch {
    // DMs disabled or user not found — silently ignore
  }
}

/** Send to the guild log channel if one is configured. */
export async function logToChannel(
  guildId: string | null | undefined,
  embeds: EmbedBuilder[],
): Promise<void> {
  if (!guildId || !activeClient) return;
  try {
    const cfg = await configRepo.getGuildConfig(guildId);
    if (!cfg?.logChannelId) return;
    const channel = await activeClient.channels.fetch(cfg.logChannelId) as TextChannel | null;
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds });
  } catch (err) {
    logger.warn({ err, guildId }, "Failed to log to channel");
  }
}
