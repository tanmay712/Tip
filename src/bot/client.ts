import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  type ChatInputCommandInteraction,
} from "discord.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { registerEvents } from "./events/ready.js";
import { registerInteractionHandler } from "./events/interactionCreate.js";

export interface BotCommand {
  data: { name: string; toJSON?: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands = new Collection<string, BotCommand>();

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  registerEvents(client);
  registerInteractionHandler(client);

  return client;
}

export async function startBot(): Promise<Client> {
  const client = createClient();

  // Dynamically load commands
  const commandModules = await Promise.all([
    import("./commands/wallet.js"),
    import("./commands/tip.js"),
    import("./commands/rain.js"),
    import("./commands/airdrop.js"),
    import("./commands/balance.js"),
    import("./commands/history.js"),
    import("./commands/leaderboard.js"),
    import("./commands/price.js"),
    import("./commands/network.js"),
    import("./commands/help.js"),
  ]);

  for (const mod of commandModules) {
    const cmd = mod.default as BotCommand;
    commands.set((cmd.data as { name: string }).name, cmd);
  }

  await client.login(config.discord.token);
  logger.info(`Bot logged in with ${commands.size} commands`);
  return client;
}
