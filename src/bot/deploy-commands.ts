import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export async function deployCommands(): Promise<void> {
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

  const commands = commandModules.map((mod) => {
    const cmd = mod.default;
    return typeof cmd.data.toJSON === "function" ? cmd.data.toJSON() : cmd.data;
  });

  const rest = new REST({ version: "10" }).setToken(config.discord.token);

  if (config.discord.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(
        config.discord.clientId,
        config.discord.guildId,
      ),
      { body: commands },
    );
    logger.info(
      `Deployed ${commands.length} commands to guild ${config.discord.guildId}`,
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: commands,
    });
    logger.info(`Deployed ${commands.length} commands globally`);
  }
}
