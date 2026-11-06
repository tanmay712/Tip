import type { Client } from "discord.js";
import { logger } from "../../utils/logger.js";

export function registerEvents(client: Client): void {
  client.once("ready", (c) => {
    logger.info(`Crypto is online as ${c.user.tag} — serving ${c.guilds.cache.size} guilds`);
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.on("warn", (msg) => {
    logger.warn({ warning: msg }, "Discord client warning");
  });
}
