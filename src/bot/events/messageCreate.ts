import { type Client, type Message, ChannelType } from "discord.js";
import { PREFIX, EMOJIS } from "../../utils/constants.js";
import { logger } from "../../utils/logger.js";
import { handlePrefixCommand } from "../prefix/index.js";
import { withComponentsV2Message } from "../components/v2.js";

const SUPPORTED_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
  ChannelType.GuildForum,
  ChannelType.DM,
]);

export function registerMessageHandler(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    // Only handle in supported channel types (guild channels, threads, forums, DMs)
    if (message.channel.type !== undefined && !SUPPORTED_CHANNEL_TYPES.has(message.channel.type)) {
      return;
    }

    // Rate limiting is handled inside handlePrefixCommand
    await withComponentsV2Message(message, async () => {
      try {
        await handlePrefixCommand(message);
      } catch (err) {
        logger.error({ err, user: message.author.id }, "Prefix command failed");
        await message.reply(`${EMOJIS.error} Something went wrong. Please try again later.`);
      }
    });
  });
}
