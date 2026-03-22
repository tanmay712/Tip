import { prisma } from "./client.js";
import { logger } from "../utils/logger.js";

async function main() {
  logger.info("Database seed complete — no default data required");
  logger.info("Users and wallets are created on-demand when they interact with the bot");
}

main()
  .catch((e) => {
    logger.error(e, "Seed failed");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
