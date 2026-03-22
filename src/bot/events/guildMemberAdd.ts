import type { Client, GuildMember } from "discord.js";
import { logger } from "../../utils/logger.js";

export function registerGuildMemberEvents(client: Client): void {
  client.on("guildMemberAdd", async (member: GuildMember) => {
    logger.debug({ guild: member.guild.id, user: member.id }, "New member joined");
  });
}
