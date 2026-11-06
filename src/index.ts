import { connectDatabase } from "./database/client.js";
import { startBot } from "./bot/client.js";
import { startApiServer } from "./api/server.js";
import { startDepositPoller } from "./core/deposit.service.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting Crypto...");

  await connectDatabase();
  logger.info("Database connected");

  await startApiServer();

  startDepositPoller();

  await startBot();

  logger.info("Crypto is fully operational");
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start Crypto");
  process.exit(1);
});

process.on("SIGINT", () => {
  logger.info("Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  process.exit(0);
});
