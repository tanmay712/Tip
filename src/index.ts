import { connectDatabase } from "./database/client.js";
import { startBot } from "./bot/client.js";
import { startApiServer } from "./api/server.js";
import { validateAlchemyConnection } from "./blockchain/alchemy.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting Hodlr...");

  // Connect database
  await connectDatabase();
  logger.info("Database connected");

  // Validate Alchemy API connection before serving any blockchain commands
  await validateAlchemyConnection();

  // Start API server (webhooks, health, stats)
  await startApiServer();

  // Start Discord bot
  await startBot();

  logger.info("Hodlr is fully operational");
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start Hodlr");
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  process.exit(0);
});
