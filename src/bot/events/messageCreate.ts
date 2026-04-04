import { type Client, type Message } from "discord.js";
import { PREFIX, EMOJIS } from "../../utils/constants.js";
import { checkRateLimit } from "../../utils/rate-limit.js";
import { logger } from "../../utils/logger.js";
import { handlePrefixCommand } from "../prefix/index.js";

export function registerMessageHandler(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    // Ignore bots and messages without the command prefix
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const { allowed, retryAfterMs } = checkRateLimit(message.author.id);
    if (!allowed) {
      await message.reply(
        `${EMOJIS.warning} Slow down! Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
      );
      return;
    }

    try {
      await handlePrefixCommand(message);
    } catch (err) {
      logger.error({ err, user: message.author.id }, "Prefix command failed");
      await message.reply(
        `${EMOJIS.error} Something went wrong. Please try again later.`,
      );
    }
  });
}
