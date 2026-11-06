import type { Client, GuildMember } from "discord.js";
import { brandEmbed } from "../components/embeds.js";
import { BRAND, EMOJIS, PREFIX } from "../../utils/constants.js";
import { logger } from "../../utils/logger.js";

export function registerGuildMemberEvents(client: Client): void {
  client.on("guildMemberAdd", async (member: GuildMember) => {
    logger.debug({ guild: member.guild.id, user: member.id }, "New member joined");

    try {
      await member.send({
        embeds: [
          brandEmbed()
            .setTitle(`${EMOJIS.wallet} Welcome to ${BRAND.name}!`)
            .setDescription(
              `**${member.guild.name}** uses **${BRAND.name}** for instant crypto tipping across 9 networks.`,
            )
            .addFields(
              {
                name: "Get started",
                value: `Use \`/wallet deposit\` or \`${PREFIX}wallet deposit <chain>\` to fund your account.`,
                inline: false,
              },
              {
                name: "Tip someone",
                value: `\`/tip @user 0.01 ETH\` or \`${PREFIX}tip @user 0.01 ETH\``,
                inline: false,
              },
              {
                name: "All commands",
                value: `\`/help\` or \`${PREFIX}help\``,
                inline: false,
              },
            ),
        ],
      });
    } catch {
      // DMs disabled
    }
  });
}
