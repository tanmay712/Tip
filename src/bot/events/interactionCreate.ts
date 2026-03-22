import {
  type Client,
  type Interaction,
  ChatInputCommandInteraction,
} from "discord.js";
import { commands } from "../client.js";
import { checkRateLimit } from "../../utils/rate-limit.js";
import { logger } from "../../utils/logger.js";
import { EMOJIS } from "../../utils/constants.js";

export function registerInteractionHandler(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    }
    // Button interactions are handled in the airdrop command
  });
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) return;

  const { allowed, retryAfterMs } = checkRateLimit(interaction.user.id);
  if (!allowed) {
    await interaction.reply({
      content: `${EMOJIS.warning} Slow down! Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error(
      { err, command: interaction.commandName, user: interaction.user.id },
      "Command execution failed",
    );
    const msg = `${EMOJIS.error} Something went wrong. Please try again later.`;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}
