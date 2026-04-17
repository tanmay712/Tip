/**
 * Notification helpers — send DMs and log-channel messages.
 */

import { type EmbedBuilder, type TextChannel } from "discord.js";
import { activeClient } from "./client.js";
import * as configRepo from "../database/repositories/config.repo.js";
import * as userRepo from "../database/repositories/user.repo.js";
import { prisma } from "../database/client.js";
import { logger } from "../utils/logger.js";

/** DM a user unconditionally. Silently ignores if DMs are closed or user not found. */
export async function dmUser(discordId: string, embeds: EmbedBuilder[]): Promise<void> {
  if (!activeClient) return;
  try {
    const user = await activeClient.users.fetch(discordId);
    await user.send({ embeds });
  } catch {
    // DMs closed or user not found
  }
}

/**
 * DM a user only if they have opted in to notifications.
 * Returns true if the DM was sent.
 */
export async function dmUserIfEnabled(
  discordId: string,
  embeds: EmbedBuilder[],
): Promise<boolean> {
  try {
    const enabled = await userRepo.isDmEnabled(discordId);
    if (!enabled) return false;
    await dmUser(discordId, embeds);
    return true;
  } catch {
    return false;
  }
}

/** Send to a specific guild's log channel. */
export async function logToChannel(
  guildId: string | null | undefined,
  embeds: EmbedBuilder[],
): Promise<void> {
  if (!guildId || !activeClient) return;
  try {
    const cfg = await configRepo.getGuildConfig(guildId);
    if (!cfg?.logChannelId) return;
    const channel = await activeClient.channels.fetch(cfg.logChannelId);
    if (!channel || !channel.isTextBased()) return;
    await (channel as TextChannel).send({ embeds });
  } catch (err) {
    logger.warn({ err, guildId }, "Failed to log to channel");
  }
}

/** Send to ALL configured log channels (used by background services like deposit poller). */
export async function logToAllChannels(embeds: EmbedBuilder[]): Promise<void> {
  if (!activeClient) return;
  try {
    const configs = await prisma.guildConfig.findMany({
      where: { logChannelId: { not: null } },
      select: { guildId: true },
    });
    await Promise.allSettled(configs.map((c) => logToChannel(c.guildId, embeds)));
  } catch (err) {
    logger.warn({ err }, "Failed to log to all channels");
  }
}
